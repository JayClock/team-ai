import { access, chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveDataDirectory } from '../db/sqlite';
import { ProblemError } from '../errors/problem-error';
import type {
  AcpProviderCatalogPayload,
  AcpProviderDistributionType,
  AcpProviderPayload,
  AcpProviderSource,
  InstallAcpProviderPayload,
} from '../schemas/acp-provider';

const execFileAsync = promisify(execFile);

export interface ProviderCommand {
  args: string[];
  command: string;
}

type StaticProviderPreset = {
  args: string[];
  command: string;
  description: string;
  id: string;
  name: string;
};

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

interface ListAcpProvidersOptions {
  includeRegistry?: boolean;
}

interface InstallAcpProviderInput {
  distributionType?: AcpProviderDistributionType;
  providerId: string;
}

interface CommandResolverDeps {
  fetchImpl?: typeof fetch;
}

interface RegistryCacheEntry {
  error: string | null;
  fetchedAt: number;
  registry: RegistryResponse | null;
}

const ACP_REGISTRY_URL =
  process.env.TEAMAI_ACP_REGISTRY_URL?.trim() ||
  'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';
const REGISTRY_TTL_MS = 5 * 60 * 1000;

const STATIC_PROVIDER_PRESETS: StaticProviderPreset[] = [
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex-acp',
    args: [],
    description: 'OpenAI Codex CLI (via codex-acp wrapper)',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: ['acp'],
    description: 'OpenCode AI coding agent',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    args: ['--experimental-acp'],
    description: 'Google Gemini CLI',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    args: ['--acp', '--allow-all-tools', '--no-ask-user'],
    description: 'GitHub Copilot CLI',
  },
  {
    id: 'auggie',
    name: 'Auggie',
    command: 'auggie',
    args: ['--acp'],
    description: "Augment Code's AI agent",
  },
  {
    id: 'kimi',
    name: 'Kimi',
    command: 'kimi',
    args: ['acp'],
    description: "Moonshot AI's Kimi CLI",
  },
  {
    id: 'kiro',
    name: 'Kiro',
    command: 'kiro-cli',
    args: ['acp'],
    description: 'Amazon Kiro AI coding agent',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    command: 'qodercli',
    args: ['--acp', '--yolo'],
    description: 'Qoder AI coding agent',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: [],
    description: 'Anthropic Claude Code',
  },
];

const registryCache: RegistryCacheEntry = {
  registry: null,
  fetchedAt: 0,
  error: null,
};

export async function listAcpProviders(
  options: ListAcpProvidersOptions = {},
  deps: CommandResolverDeps = {},
): Promise<AcpProviderCatalogPayload> {
  const includeRegistry = options.includeRegistry ?? false;
  const manifest = await readInstalledProviderManifest();
  const registryResult = includeRegistry
    ? await fetchRegistryWithCache(deps.fetchImpl)
    : { registry: null, error: null, fetchedAt: null as number | null };

  const registryAgents = new Map(
    (registryResult.registry?.agents ?? []).map((agent) => [agent.id, agent]),
  );
  const providerIds = new Set<string>([
    ...STATIC_PROVIDER_PRESETS.map((provider) => provider.id),
    ...registryAgents.keys(),
  ]);

  const providers = await Promise.all(
    [...providerIds].map(async (providerId) =>
      buildProviderPayload(providerId, manifest, registryAgents.get(providerId) ?? null),
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

export async function installAcpProvider(
  input: InstallAcpProviderInput,
  deps: CommandResolverDeps = {},
): Promise<InstallAcpProviderPayload> {
  const registryResult = await fetchRegistryWithCache(deps.fetchImpl, true);
  const registryAgent = registryResult.registry?.agents.find(
    (agent) => agent.id === input.providerId,
  );

  if (!registryAgent) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-install-not-supported',
      title: 'ACP Provider Install Not Supported',
      status: 400,
      detail:
        `Provider ${input.providerId} does not expose an automated ACP registry installation.`,
    });
  }

  const distributionType = await resolveDistributionType(
    registryAgent,
    input.distributionType,
  );

  if (!distributionType) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-install-unavailable',
      title: 'ACP Provider Install Unavailable',
      status: 409,
      detail:
        `Provider ${input.providerId} does not have a compatible installation ` +
        'distribution on this machine.',
    });
  }

  const manifest = await readInstalledProviderManifest();
  const installedAt = new Date().toISOString();
  const command = await installRegistryProvider(
    registryAgent,
    distributionType,
    installedAt,
    deps.fetchImpl,
  );

  manifest[input.providerId] = {
    command: command.command,
    args: command.args,
    distributionType,
    installedAt,
  };
  await writeInstalledProviderManifest(manifest);

  return {
    success: true,
    providerId: input.providerId,
    distributionType,
    installedAt,
    command: formatCommand(command),
  };
}

export async function resolveAcpRuntimeProviderCommand(
  provider: string,
  deps: CommandResolverDeps = {},
): Promise<ProviderCommand | null> {
  const envCommand = resolveEnvProviderCommand(provider);
  if (envCommand) {
    return envCommand;
  }

  const manifest = await readInstalledProviderManifest();
  const installed = manifest[provider];
  if (installed) {
    return {
      command: installed.command,
      args: installed.args,
    };
  }

  const preset = STATIC_PROVIDER_PRESETS.find((candidate) => candidate.id === provider);
  if (preset && (await commandExists(preset.command))) {
    return {
      command: preset.command,
      args: preset.args,
    };
  }

  const registryResult = await fetchRegistryWithCache(deps.fetchImpl);
  const registryAgent = registryResult.registry?.agents.find(
    (candidate) => candidate.id === provider,
  );
  if (!registryAgent) {
    return null;
  }

  return await resolveRegistryRuntimeCommand(registryAgent, manifest);
}

export function resolveEnvProviderCommand(provider: string): ProviderCommand | null {
  const envKey = getProviderEnvCommandKey(provider);
  const rawCommand = process.env[envKey]?.trim();

  if (!rawCommand) {
    return null;
  }

  return parseProviderCommand(rawCommand);
}

export function getProviderEnvCommandKey(provider: string): string {
  return `TEAMAI_ACP_${normalizeEnvProviderName(provider)}_COMMAND`;
}

function normalizeEnvProviderName(provider: string): string {
  return provider
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_');
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

function formatCommand(command: ProviderCommand): string {
  return [command.command, ...command.args].join(' ');
}

async function buildProviderPayload(
  providerId: string,
  manifest: InstalledProviderManifest,
  registryAgent: RegistryAgent | null,
): Promise<AcpProviderPayload> {
  const preset = STATIC_PROVIDER_PRESETS.find((candidate) => candidate.id === providerId) ?? null;
  const envCommand = resolveEnvProviderCommand(providerId);
  const installedCommand = manifest[providerId]
    ? {
        command: manifest[providerId].command,
        args: manifest[providerId].args,
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

  const source = resolveProviderSource(preset, registryAgent);
  const distributionTypes = resolveDistributionTypes(registryAgent, manifest[providerId] ?? null);

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
    installed: Boolean(manifest[providerId]),
    unavailableReason: chosenCommand
      ? null
      : registryAgent
        ? 'Available in ACP registry but not installed on this machine yet.'
        : `Command ${preset?.command ?? providerId} was not found in PATH.`,
  };
}

function resolveProviderSource(
  preset: StaticProviderPreset | null,
  registryAgent: RegistryAgent | null,
): AcpProviderSource {
  if (preset && registryAgent) {
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
  const installed = manifest[agent.id];
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
  fetchImpl?: typeof fetch,
): Promise<ProviderCommand> {
  switch (distributionType) {
    case 'npx':
      return await warmNpxProvider(agent);
    case 'uvx':
      return await warmUvxProvider(agent);
    case 'binary':
      return await installBinaryProvider(agent, installedAt, fetchImpl);
  }
}

async function warmNpxProvider(agent: RegistryAgent): Promise<ProviderCommand> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-install-invalid',
      title: 'ACP Provider Install Invalid',
      status: 400,
      detail: `Provider ${agent.id} does not declare an npx distribution.`,
    });
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
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-install-invalid',
      title: 'ACP Provider Install Invalid',
      status: 400,
      detail: `Provider ${agent.id} does not declare a uvx distribution.`,
    });
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
  fetchImpl?: typeof fetch,
): Promise<ProviderCommand> {
  const binaryDistribution = resolveBinaryDistribution(agent);
  if (!binaryDistribution) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-install-invalid',
      title: 'ACP Provider Install Invalid',
      status: 400,
      detail: `Provider ${agent.id} does not declare a binary distribution for this platform.`,
    });
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
  const response = await (fetchImpl ?? fetch)(archiveUrl);

  if (!response.ok) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-provider-download-failed',
      title: 'ACP Provider Download Failed',
      status: 502,
      detail: `Failed to download ${agent.id}: ${response.status} ${response.statusText}`,
    });
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

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-provider-binary-missing',
    title: 'ACP Provider Binary Missing',
    status: 500,
    detail:
      `Downloaded binary for provider could not be located. Expected ${command} under ` +
      installDirectory,
  });
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
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
        new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-install-launch-failed',
          title: 'ACP Provider Install Launch Failed',
          status: 503,
          detail: error.message,
        }),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-install-command-failed',
          title: 'ACP Provider Install Command Failed',
          status: 502,
          detail:
            stderr.trim() ||
            `${command} ${args.join(' ')} exited with status ${code ?? 'null'}`,
        }),
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

function resolveInstalledProviderManifestPath(): string {
  return join(resolveDataDirectory(), 'acp', 'providers.json');
}

async function fetchRegistryWithCache(
  fetchImpl?: typeof fetch,
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
    const response = await (fetchImpl ?? fetch)(ACP_REGISTRY_URL);
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
