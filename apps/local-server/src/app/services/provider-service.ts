import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProblemError } from '../errors/problem-error';
import type {
  ProviderModelPayload,
  ProviderPayload,
} from '../schemas/provider';

const execFileAsync = promisify(execFile);
const PROVIDER_MODEL_CACHE_TTL_MS = 60 * 1000;

type ProviderCatalogEntry = {
  defaultModel: string | null;
  id: string;
  modelListing?: ProviderModelListingConfig;
  models?: ProviderModelPayload[];
  name: string;
};

type ProviderModelListingConfig = {
  args: string[];
  command: string;
  parse: (stdout: string, providerId: string) => ProviderModelPayload[];
};

type ProviderModelCacheEntry = {
  fetchedAt: number;
  models: ProviderModelPayload[];
};

type ProviderModelCommandOutput = {
  stderr: string;
  stdout: string;
};

type ProviderModelCommandError = Error & {
  code?: number | string;
  killed?: boolean;
  signal?: string | null;
  stderr?: string;
  stdout?: string;
};

export type ProviderModelCommandRunner = (
  command: string,
  args: string[],
) => Promise<ProviderModelCommandOutput>;

export interface ListProviderModelsDeps {
  now?: () => number;
  runCommand?: ProviderModelCommandRunner;
}

const providerCatalog: ProviderCatalogEntry[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    defaultModel: null,
    modelListing: {
      command: 'opencode',
      args: ['models'],
      parse: parseOpencodeModels,
    },
  },
];

const providerModelCache = new Map<string, ProviderModelCacheEntry>();

export function clearProviderModelCache(): void {
  providerModelCache.clear();
}

function getProviderById(providerId: string) {
  const normalizedProviderId = providerId.trim();
  return (
    providerCatalog.find((provider) => provider.id === normalizedProviderId) ??
    null
  );
}

export async function listProviders(): Promise<ProviderPayload[]> {
  return providerCatalog.map((provider) => ({
    id: provider.id,
    name: provider.name,
    defaultModel: provider.defaultModel,
    modelsHref: `/api/providers/${provider.id}/models`,
  }));
}

export async function listProviderModels(
  providerId: string,
  deps: ListProviderModelsDeps = {},
): Promise<ProviderModelPayload[]> {
  const provider = getProviderById(providerId);

  if (!provider) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/provider-not-found',
      title: 'Provider Not Found',
      status: 404,
      detail: `Provider ${providerId} was not found`,
    });
  }

  if (provider.modelListing) {
    return await listRuntimeProviderModels(provider, deps);
  }

  if (provider.models) {
    return provider.models;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/provider-model-listing-unsupported',
    title: 'Provider Model Listing Unsupported',
    status: 501,
    detail: `Provider ${provider.id} does not support runtime model listing`,
  });
}

async function listRuntimeProviderModels(
  provider: ProviderCatalogEntry,
  deps: ListProviderModelsDeps,
): Promise<ProviderModelPayload[]> {
  const now = deps.now ?? Date.now;
  const cached = providerModelCache.get(provider.id);
  if (cached && now() - cached.fetchedAt < PROVIDER_MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const listing = provider.modelListing;
  if (!listing) {
    return provider.models ?? [];
  }

  const runCommand = deps.runCommand ?? runProviderModelCommand;

  let output: ProviderModelCommandOutput;
  try {
    output = await runCommand(listing.command, listing.args);
  } catch (error) {
    throw normalizeProviderModelCommandError(
      provider.id,
      listing.command,
      error,
    );
  }

  const models = listing.parse(output.stdout, provider.id);
  providerModelCache.set(provider.id, {
    fetchedAt: now(),
    models,
  });
  return models;
}

async function runProviderModelCommand(
  command: string,
  args: string[],
): Promise<ProviderModelCommandOutput> {
  const result = await execFileAsync(command, args, {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function normalizeProviderModelCommandError(
  providerId: string,
  command: string,
  error: unknown,
): ProblemError {
  const commandError = error as ProviderModelCommandError;
  const detail =
    normalizeOptionalText(commandError.stderr) ??
    normalizeOptionalText(commandError.message) ??
    'Unknown provider model command failure';

  if (commandError.code === 'ENOENT') {
    return new ProblemError({
      type: 'https://team-ai.dev/problems/provider-model-command-missing',
      title: 'Provider Model Command Missing',
      status: 503,
      detail: `Provider ${providerId} cannot list models because "${command}" is not available`,
    });
  }

  if (commandError.killed || commandError.signal === 'SIGTERM') {
    return new ProblemError({
      type: 'https://team-ai.dev/problems/provider-model-command-timeout',
      title: 'Provider Model Command Timed Out',
      status: 504,
      detail: `Provider ${providerId} model listing timed out`,
    });
  }

  return new ProblemError({
    type: 'https://team-ai.dev/problems/provider-model-command-failed',
    title: 'Provider Model Command Failed',
    status: 502,
    detail: `Provider ${providerId} model listing failed: ${detail}`,
  });
}

function parseOpencodeModels(
  stdout: string,
  providerId: string,
): ProviderModelPayload[] {
  const seen = new Set<string>();
  const models: ProviderModelPayload[] = [];

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const id = rawLine.trim();
    if (!id || !id.includes('/') || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({
      id,
      name: id,
      providerId,
    });
  }

  return models;
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
