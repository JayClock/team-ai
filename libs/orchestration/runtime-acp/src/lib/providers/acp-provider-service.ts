import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { resolveDataDirectory } from '../utils/data-directory.js';
import { listStaticRuntimeProviderDefinitions } from './acp-provider-definitions.js';

const execFileAsync = promisify(execFile);

export interface ProviderCommand {
  args: string[];
  command: string;
}

type RegistryAgentDistribution = {
  binary?: Record<string, unknown>;
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
  distribution: RegistryAgentDistribution;
  id: string;
};

type RegistryResponse = {
  agents: RegistryAgent[];
  version: string;
};

type InstalledProviderManifestEntry = {
  args: string[];
  command: string;
};

type InstalledProviderManifest = Record<string, InstalledProviderManifestEntry>;

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

const ACP_PROVIDER_ALIASES: Record<string, string> = {
  'codex-acp': 'codex',
};

const registryCache: RegistryCacheEntry = {
  registry: null,
  fetchedAt: 0,
  error: null,
};

export function normalizeAcpProviderId(provider: string): string {
  const normalized = provider.trim();
  return ACP_PROVIDER_ALIASES[normalized] ?? normalized;
}

export async function resolveAcpRuntimeProviderCommand(
  provider: string,
  deps: CommandResolverDeps = {},
): Promise<ProviderCommand | null> {
  const providerId = normalizeAcpProviderId(provider);
  const envCommand = resolveEnvProviderCommand(providerId);
  if (envCommand) {
    return envCommand;
  }

  const manifest = await readInstalledProviderManifest();
  const installed = getInstalledManifestEntry(manifest, providerId);
  if (installed) {
    return {
      command: installed.command,
      args: installed.args,
    };
  }

  const preset = listStaticRuntimeProviderDefinitions().find(
    (candidate) => candidate.id === providerId,
  )?.runtimeCommandPreset;
  if (preset && (await commandExists(preset.command))) {
    return {
      command: preset.command,
      args: preset.args,
    };
  }

  const registryResult = await fetchRegistryWithCache(deps.fetchImpl);
  const registryAgent = registryResult.registry?.agents.find(
    (candidate) => normalizeAcpProviderId(candidate.id) === providerId,
  );
  if (!registryAgent) {
    return null;
  }

  return await resolveRegistryRuntimeCommand(
    {
      ...registryAgent,
      id: providerId,
    },
    manifest,
  );
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
  return `TEAMAI_ACP_${normalizeEnvProviderName(normalizeAcpProviderId(provider))}_COMMAND`;
}

function normalizeEnvProviderName(provider: string): string {
  return provider
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_');
}

function providerIdVariants(provider: string): string[] {
  const canonical = normalizeAcpProviderId(provider);
  return canonical === provider ? [canonical] : [canonical, provider];
}

function getInstalledManifestEntry(
  manifest: InstalledProviderManifest,
  provider: string,
): InstalledProviderManifestEntry | null {
  for (const candidate of providerIdVariants(provider)) {
    const entry = manifest[candidate];
    if (entry) {
      return entry;
    }
  }
  return null;
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

async function readInstalledProviderManifest(): Promise<InstalledProviderManifest> {
  try {
    const raw = await readFile(resolveInstalledProviderManifestPath(), 'utf-8');
    const parsed = JSON.parse(raw) as InstalledProviderManifest;
    return parsed ?? {};
  } catch {
    return {};
  }
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

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
