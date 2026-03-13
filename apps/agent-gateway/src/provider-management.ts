import { access, chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import type { GatewayConfig } from './config.js';
import {
  ACP_CLI_PROVIDER_PRESETS,
  getProviderEnvCommandKey,
  normalizeProviderId,
} from './providers/provider-presets.js';

const execFileAsync = promisify(execFile);

export type AcpProviderStatus = 'available' | 'unavailable';
export type AcpProviderSource = 'static' | 'registry' | 'hybrid';
export type AcpProviderDistributionType = 'npx' | 'uvx' | 'binary';

export interface AcpProviderPayload {
  command: string | null;
  description: string;
  distributionTypes: AcpProviderDistributionType[];
  envCommandKey: string;
  id: string;
  installable: boolean;
  installed: boolean;
  name: string;
  source: AcpProviderSource;
  status: AcpProviderStatus;
  unavailableReason: string | null;
}

export interface AcpProviderRegistryPayload {
  error: string | null;
  fetchedAt: string | null;
  url: string;
}

export interface AcpProviderCatalogPayload {
  providers: AcpProviderPayload[];
  registry: AcpProviderRegistryPayload;
}

export interface InstallAcpProviderPayload {
  command: string;
  distributionType: AcpProviderDistributionType;
  installedAt: string;
  providerId: string;
  success: boolean;
}

type RegistryAgentDistribution = {
  binary?: Partial<
    Record<
      PlatformTarget,
      {
        archive: string;
        args?: string[];
        cmd: string;
      }
    >
  >;
  npx?: {
    args?: string[];
    package: string;
  };
  uvx?: {
    args?: string[];
    package: string;
  };
};

type RegistryAgent = {
  description: string;
  distribution: RegistryAgentDistribution;
  id: string;
  name: string;
};

type RegistryResponse = {
  agents: RegistryAgent[];
  version: string;
};

type InstalledProviderManifestEntry = {
  args: string[];
  command: string;
  distributionType: AcpProviderDistributionType;
  installedAt: string;
};

type InstalledProviderManifest = Record<string, InstalledProviderManifestEntry>;

type PlatformTarget =
  | 'darwin-aarch64'
  | 'darwin-x86_64'
  | 'linux-aarch64'
  | 'linux-x86_64'
  | 'windows-aarch64'
  | 'windows-x86_64';

interface ListProvidersOptions {
  includeRegistry?: boolean;
}

interface InstallProviderInput {
  distributionType?: AcpProviderDistributionType;
  providerId: string;
}

interface RegistryCacheEntry {
  error: string | null;
  fetchedAt: number;
  registry: RegistryResponse | null;
}

class ProviderManagementError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

interface ProviderCommand {
  args: string[];
  command: string;
}

const ACP_REGISTRY_URL =
  process.env.TEAMAI_ACP_REGISTRY_URL?.trim() ||
  'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';
const REGISTRY_TTL_MS = 5 * 60 * 1000;

const registryCache: RegistryCacheEntry = {
  registry: null,
  fetchedAt: 0,
  error: null,
};

export class ProviderManagement {
  constructor(private readonly config: GatewayConfig) {}

  async listProviders(
    options: ListProvidersOptions = {},
  ): Promise<AcpProviderCatalogPayload> {
    const includeRegistry = options.includeRegistry ?? false;
    const manifest = await readInstalledProviderManifest();
    const registryResult = includeRegistry
      ? await fetchRegistryWithCache()
      : { registry: null, error: null, fetchedAt: null as number | null };

    const registryAgents = new Map(
      (registryResult.registry?.agents ?? []).map((agent) => [
        normalizeProviderId(agent.id),
        {
          ...agent,
          id: normalizeProviderId(agent.id),
        },
      ]),
    );
    const providerIds = new Set<string>([
      ...this.config.providers.map((providerId) => normalizeProviderId(providerId)),
      ...registryAgents.keys(),
    ]);

    const providers = await Promise.all(
      [...providerIds].map(async (providerId) =>
        await buildProviderPayload(providerId, manifest, registryAgents.get(providerId) ?? null, this.config),
      ),
    );

    providers.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'available' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    return {
      providers,
      registry: {
        url: ACP_REGISTRY_URL,
        error: registryResult.error,
        fetchedAt: registryResult.fetchedAt
          ? new Date(registryResult.fetchedAt).toISOString()
          : null,
      },
    };
  }

  async installProvider(
    input: InstallProviderInput,
  ): Promise<InstallAcpProviderPayload> {
    const providerId = normalizeProviderId(input.providerId);
    const registryResult = await fetchRegistryWithCache(true);
    const registryAgent = registryResult.registry?.agents.find(
      (agent) => normalizeProviderId(agent.id) === providerId,
    );

    if (!registryAgent) {
      throw new ProviderManagementError(
        400,
        'ACP_PROVIDER_INSTALL_NOT_SUPPORTED',
        `Provider ${providerId} does not expose an automated ACP registry installation.`,
      );
    }

    const distributionType = await resolveDistributionType(
      registryAgent,
      input.distributionType,
    );

    if (!distributionType) {
      throw new ProviderManagementError(
        409,
        'ACP_PROVIDER_INSTALL_UNAVAILABLE',
        `Provider ${providerId} does not have a compatible installation distribution on this machine.`,
      );
    }

    const manifest = await readInstalledProviderManifest();
    const installedAt = new Date().toISOString();
    const command = await installRegistryProvider(
      registryAgent,
      distributionType,
      installedAt,
    );

    manifest[providerId] = {
      command: command.command,
      args: command.args,
      distributionType,
      installedAt,
    };
    await writeInstalledProviderManifest(manifest);

    return {
      success: true,
      providerId,
      distributionType,
      installedAt,
      command: formatCommand(command),
    };
  }
}

export function isProviderManagementError(
  error: unknown,
): error is ProviderManagementError {
  return error instanceof ProviderManagementError;
}

function resolveDataDirectory(): string {
  return process.env.TEAMAI_DATA_DIR ?? join(process.cwd(), '.team-ai');
}

function resolveInstalledProviderManifestPath(): string {
  return join(resolveDataDirectory(), 'acp', 'providers.json');
}

function getInstalledManifestEntry(
  manifest: InstalledProviderManifest,
  provider: string,
): InstalledProviderManifestEntry | null {
  const providerId = normalizeProviderId(provider);
  return manifest[providerId] ?? null;
}

function formatCommand(command: ProviderCommand): string {
  return [command.command, ...command.args].join(' ');
}

function parseProviderCommand(rawCommand: string): ProviderCommand | null {
  const [command, ...args] = rawCommand
    .trim()
    .split(/\s+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (!command) {
    return null;
  }

  return {
    command,
    args,
  };
}

function resolveCodexEnvCommand(): ProviderCommand | null {
  const rawCommand = process.env.AGENT_GATEWAY_CODEX_COMMAND?.trim();
  if (!rawCommand) {
    return null;
  }
  return parseProviderCommand(rawCommand);
}

async function buildProviderPayload(
  providerId: string,
  manifest: InstalledProviderManifest,
  registryAgent: RegistryAgent | null,
  config: GatewayConfig,
): Promise<AcpProviderPayload> {
  const preset =
    ACP_CLI_PROVIDER_PRESETS.find((candidate) => candidate.id === providerId) ??
    null;

  if (providerId === 'codex') {
    return buildCodexProviderPayload(
      providerId,
      manifest,
      registryAgent,
      config,
    );
  }

  const envCommand = resolveEnvProviderCommand(providerId);
  const installedEntry = getInstalledManifestEntry(manifest, providerId);
  const installedCommand = installedEntry
    ? {
        command: installedEntry.command,
        args: installedEntry.args,
      }
    : null;
  const staticCommand =
    preset && (await commandExists(preset.command))
      ? {
          command: preset.command,
          args: preset.args,
        }
      : null;
  const registryCommand = registryAgent
    ? await resolveRegistryRuntimeCommand(registryAgent, manifest)
    : null;
  const chosenCommand = envCommand ?? installedCommand ?? staticCommand ?? registryCommand;

  const source = resolveProviderSource(preset !== null, registryAgent);
  const distributionTypes = resolveDistributionTypes(
    registryAgent,
    installedEntry,
  );

  return {
    id: providerId,
    name: preset?.name ?? registryAgent?.name ?? providerId,
    description: preset?.description ?? registryAgent?.description ?? providerId,
    command: chosenCommand ? formatCommand(chosenCommand) : preset?.command ?? null,
    envCommandKey: getProviderEnvCommandKey(providerId),
    source,
    status: chosenCommand ? 'available' : 'unavailable',
    installable: distributionTypes.length > 0,
    distributionTypes,
    installed: installedEntry !== null,
    unavailableReason: chosenCommand
      ? null
      : registryAgent
        ? 'Available in ACP registry but not installed on this machine yet.'
        : `Command ${preset?.command ?? providerId} was not found in PATH.`,
  };
}

function buildCodexProviderPayload(
  providerId: string,
  manifest: InstalledProviderManifest,
  registryAgent: RegistryAgent | null,
  config: GatewayConfig,
): AcpProviderPayload {
  const envCommand = resolveCodexEnvCommand();
  const installedEntry = getInstalledManifestEntry(manifest, providerId);
  const installedCommand = installedEntry
    ? {
        command: installedEntry.command,
        args: installedEntry.args,
      }
    : null;
  const chosenCommand =
    envCommand ??
    installedCommand ?? {
      command: config.codexCommand,
      args: [],
    };

  return {
    id: providerId,
    name: 'Codex',
    description: 'OpenAI Codex gateway adapter',
    command: formatCommand(chosenCommand),
    envCommandKey: 'AGENT_GATEWAY_CODEX_COMMAND',
    source: resolveProviderSource(true, registryAgent),
    status: 'available',
    installable: false,
    distributionTypes: [],
    installed: installedEntry !== null,
    unavailableReason: null,
  };
}

function resolveEnvProviderCommand(providerId: string): ProviderCommand | null {
  const rawCommand = process.env[getProviderEnvCommandKey(providerId)]?.trim();
  if (!rawCommand) {
    return null;
  }
  return parseProviderCommand(rawCommand);
}

function resolveProviderSource(
  hasStaticPreset: boolean,
  registryAgent: RegistryAgent | null,
): AcpProviderSource {
  if (hasStaticPreset && registryAgent) {
    return 'hybrid';
  }
  if (registryAgent) {
    return 'registry';
  }
  return 'static';
}

function resolveDistributionTypes(
  registryAgent: RegistryAgent | null,
  installed: InstalledProviderManifestEntry | null,
): AcpProviderDistributionType[] {
  const types = new Set<AcpProviderDistributionType>();
  if (installed) {
    types.add(installed.distributionType);
  }
  if (registryAgent?.distribution.npx) {
    types.add('npx');
  }
  if (registryAgent?.distribution.uvx) {
    types.add('uvx');
  }
  if (registryAgent?.distribution.binary) {
    types.add('binary');
  }
  return [...types];
}

async function resolveRegistryRuntimeCommand(
  agent: RegistryAgent,
  manifest: InstalledProviderManifest,
): Promise<ProviderCommand | null> {
  const installed = getInstalledManifestEntry(manifest, agent.id);
  if (installed) {
    return {
      command: installed.command,
      args: installed.args,
    };
  }

  if (agent.distribution.npx && (await commandExists('npx'))) {
    return {
      command: 'npx',
      args: ['-y', agent.distribution.npx.package, ...(agent.distribution.npx.args ?? [])],
    };
  }

  if (agent.distribution.uvx && (await commandExists('uvx'))) {
    return {
      command: 'uvx',
      args: [agent.distribution.uvx.package, ...(agent.distribution.uvx.args ?? [])],
    };
  }

  return null;
}

async function resolveDistributionType(
  agent: RegistryAgent,
  preferred?: AcpProviderDistributionType,
): Promise<AcpProviderDistributionType | null> {
  const candidates: AcpProviderDistributionType[] = preferred
    ? [preferred]
    : ['npx', 'uvx', 'binary'];

  for (const candidate of candidates) {
    if (candidate === 'npx' && agent.distribution.npx && (await commandExists('npx'))) {
      return 'npx';
    }
    if (candidate === 'uvx' && agent.distribution.uvx && (await commandExists('uvx'))) {
      return 'uvx';
    }
    if (candidate === 'binary' && resolveBinaryDistribution(agent) !== null) {
      return 'binary';
    }
  }

  return null;
}

async function installRegistryProvider(
  agent: RegistryAgent,
  distributionType: AcpProviderDistributionType,
  installedAt: string,
): Promise<ProviderCommand> {
  switch (distributionType) {
    case 'npx':
      return await warmNpxProvider(agent);
    case 'uvx':
      return await warmUvxProvider(agent);
    case 'binary':
      return await installBinaryProvider(agent, installedAt);
  }
}

async function warmNpxProvider(agent: RegistryAgent): Promise<ProviderCommand> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw new ProviderManagementError(
      400,
      'ACP_PROVIDER_INSTALL_INVALID',
      `Provider ${agent.id} does not declare an npx distribution.`,
    );
  }

  await runInstallerCommand('npx', ['-y', distribution.package, '--help']);
  return {
    command: 'npx',
    args: ['-y', distribution.package, ...(distribution.args ?? [])],
  };
}

async function warmUvxProvider(agent: RegistryAgent): Promise<ProviderCommand> {
  const distribution = agent.distribution.uvx;
  if (!distribution) {
    throw new ProviderManagementError(
      400,
      'ACP_PROVIDER_INSTALL_INVALID',
      `Provider ${agent.id} does not declare a uvx distribution.`,
    );
  }

  await runInstallerCommand('uvx', [distribution.package, '--help']);
  return {
    command: 'uvx',
    args: [distribution.package, ...(distribution.args ?? [])],
  };
}

async function installBinaryProvider(
  agent: RegistryAgent,
  installedAt: string,
): Promise<ProviderCommand> {
  const binaryDistribution = resolveBinaryDistribution(agent);
  if (!binaryDistribution) {
    throw new ProviderManagementError(
      400,
      'ACP_PROVIDER_INSTALL_INVALID',
      `Provider ${agent.id} does not declare a binary distribution for this platform.`,
    );
  }

  const installDirectory = join(
    resolveDataDirectory(),
    'acp',
    'providers',
    agent.id,
    installedAt.replace(/[:.]/gu, '-'),
  );
  await mkdir(installDirectory, { recursive: true });

  const archiveUrl = new URL(binaryDistribution.archive, ACP_REGISTRY_URL).toString();
  const archiveName = archiveUrl.split('/').at(-1) ?? `${agent.id}.bin`;
  const archivePath = join(installDirectory, archiveName);
  const response = await fetch(archiveUrl);

  if (!response.ok) {
    throw new ProviderManagementError(
      502,
      'ACP_PROVIDER_DOWNLOAD_FAILED',
      `Failed to download ${agent.id}: ${response.status} ${response.statusText}`,
      true,
      1000,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(archivePath, buffer);
  await extractArchive(archivePath, installDirectory);
  await unlink(archivePath).catch(() => undefined);

  const executablePath = await resolveInstalledBinaryPath(
    installDirectory,
    binaryDistribution.cmd,
  );
  await chmod(executablePath, 0o755);

  return {
    command: executablePath,
    args: binaryDistribution.args ?? [],
  };
}

function resolveBinaryDistribution(
  agent: RegistryAgent,
): { archive: string; args?: string[]; cmd: string } | null {
  const platform = detectPlatformTarget();
  if (!platform) {
    return null;
  }
  return agent.distribution.binary?.[platform] ?? null;
}

function detectPlatformTarget(): PlatformTarget | null {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64';
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64';
  }
  if (process.platform === 'win32') {
    return process.arch === 'arm64' ? 'windows-aarch64' : 'windows-x86_64';
  }
  return null;
}

async function resolveInstalledBinaryPath(
  installDirectory: string,
  command: string,
): Promise<string> {
  const directCandidate = isAbsolute(command)
    ? command
    : resolvePath(installDirectory, command);

  if (await isExecutable(directCandidate)) {
    return directCandidate;
  }

  const fileName = command.split(/[\\/]/u).at(-1) ?? command;
  const nestedCandidate = resolvePath(installDirectory, fileName);
  if (await isExecutable(nestedCandidate)) {
    return nestedCandidate;
  }

  throw new ProviderManagementError(
    500,
    'ACP_PROVIDER_BINARY_MISSING',
    `Downloaded binary for provider could not be located. Expected ${command} under ${installDirectory}`,
    true,
    1000,
  );
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function extractArchive(
  archivePath: string,
  destination: string,
): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    await runInstallerCommand('unzip', ['-o', archivePath, '-d', destination]);
    return;
  }

  if (
    archivePath.endsWith('.tar.gz') ||
    archivePath.endsWith('.tgz') ||
    archivePath.endsWith('.tar')
  ) {
    await runInstallerCommand('tar', ['-xf', archivePath, '-C', destination]);
    return;
  }

  const fallbackPath = join(destination, archivePath.split('/').at(-1) ?? 'provider-binary');
  await writeFile(fallbackPath, await readFile(archivePath));
}

async function runInstallerCommand(
  command: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (error) => {
      reject(
        new ProviderManagementError(
          503,
          'ACP_PROVIDER_INSTALL_LAUNCH_FAILED',
          error.message,
          true,
          1000,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new ProviderManagementError(
          502,
          'ACP_PROVIDER_INSTALL_COMMAND_FAILED',
          stderr.trim() ||
            `${command} ${args.join(' ')} exited with status ${code ?? 'null'}`,
          true,
          1000,
        ),
      );
    });
  });
}

async function readInstalledProviderManifest(): Promise<InstalledProviderManifest> {
  try {
    const raw = await readFile(resolveInstalledProviderManifestPath(), 'utf-8');
    const parsed = JSON.parse(raw) as InstalledProviderManifest;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeInstalledProviderManifest(
  manifest: InstalledProviderManifest,
): Promise<void> {
  const manifestPath = resolveInstalledProviderManifestPath();
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

async function fetchRegistryWithCache(
  forceRefresh = false,
): Promise<{
  error: string | null;
  fetchedAt: number | null;
  registry: RegistryResponse | null;
}> {
  const now = Date.now();
  if (
    !forceRefresh &&
    registryCache.registry &&
    now - registryCache.fetchedAt < REGISTRY_TTL_MS
  ) {
    return {
      registry: registryCache.registry,
      fetchedAt: registryCache.fetchedAt,
      error: registryCache.error,
    };
  }

  try {
    const response = await fetch(ACP_REGISTRY_URL);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const registry = (await response.json()) as RegistryResponse;
    registryCache.registry = registry;
    registryCache.fetchedAt = now;
    registryCache.error = null;
    return {
      registry,
      fetchedAt: now,
      error: null,
    };
  } catch (error) {
    registryCache.error =
      error instanceof Error ? error.message : 'Failed to fetch ACP registry';
    return {
      registry: registryCache.registry,
      fetchedAt: registryCache.registry ? registryCache.fetchedAt : null,
      error: registryCache.error,
    };
  }
}

async function commandExists(command: string): Promise<boolean> {
  if (isAbsolute(command)) {
    return await isExecutable(command);
  }

  try {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(lookup, [command]);
    return true;
  } catch {
    return false;
  }
}
