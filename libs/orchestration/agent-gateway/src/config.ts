import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type GatewayTimeoutConfig = {
  cancelGraceMs: number;
  minimumPromptTransportMs: number;
  packageManagerInitTimeoutMs: number;
  promptCompletionGraceMs: number;
  promptTimeoutMs: number;
  providerInitTimeoutMs: number;
  providerRequestTimeoutMs: number;
};

export type GatewayConfig = {
  host: string;
  port: number;
  version: string;
  protocols: string[];
  providers: string[];
  defaultProvider: string;
  timeouts: GatewayTimeoutConfig;
  retryAttempts: number;
  maxConcurrentSessions: number;
  logLevel: LogLevel;
};

type PartialGatewayConfig = Partial<GatewayConfig>;
type PartialGatewayTimeoutConfig = Partial<GatewayTimeoutConfig>;
type GatewayConfigInput = Omit<PartialGatewayConfig, 'timeouts'> & {
  timeouts?: PartialGatewayTimeoutConfig;
};

const DEFAULT_CONFIG: GatewayConfig = {
  host: '127.0.0.1',
  port: 3321,
  version: '0.1.0',
  protocols: ['mcp', 'acp', 'a2a'],
  providers: [
    'opencode',
    'claude',
    'codex',
    'gemini',
    'copilot',
    'auggie',
    'kimi',
    'kiro',
    'qoder',
  ],
  defaultProvider: 'opencode',
  timeouts: {
    promptTimeoutMs: 300_000,
    promptCompletionGraceMs: 1_000,
    cancelGraceMs: 1_000,
    providerInitTimeoutMs: 10_000,
    packageManagerInitTimeoutMs: 120_000,
    providerRequestTimeoutMs: 10_000,
    minimumPromptTransportMs: 30_000,
  },
  retryAttempts: 2,
  maxConcurrentSessions: 32,
  logLevel: 'info',
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  const fileConfig = loadFileConfig(env.AGENT_GATEWAY_CONFIG_FILE);
  const envConfig = loadEnvConfig(env);

  const merged: GatewayConfigInput = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    timeouts: {
      ...DEFAULT_CONFIG.timeouts,
      ...(fileConfig.timeouts ?? {}),
      ...(envConfig.timeouts ?? {}),
    },
  };

  return normalizeConfig(merged);
}

function loadFileConfig(configPath?: string): GatewayConfigInput {
  if (!configPath) {
    return {};
  }

  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`AGENT_GATEWAY_CONFIG_FILE not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw) as GatewayConfigInput;
  return parsed;
}

function loadEnvConfig(env: NodeJS.ProcessEnv): GatewayConfigInput {
  return {
    host: env.AGENT_GATEWAY_HOST,
    port: parseInteger(env.AGENT_GATEWAY_PORT, 'AGENT_GATEWAY_PORT'),
    version: env.AGENT_GATEWAY_VERSION,
    protocols: parseCsv(env.AGENT_GATEWAY_PROTOCOLS),
    providers: parseCsv(env.AGENT_GATEWAY_PROVIDERS),
    defaultProvider: env.AGENT_GATEWAY_DEFAULT_PROVIDER,
    timeouts: {
      promptTimeoutMs:
        parseInteger(
          env.AGENT_GATEWAY_PROMPT_TIMEOUT_MS,
          'AGENT_GATEWAY_PROMPT_TIMEOUT_MS',
        ) ??
        parseInteger(env.AGENT_GATEWAY_TIMEOUT_MS, 'AGENT_GATEWAY_TIMEOUT_MS'),
      promptCompletionGraceMs: parseInteger(
        env.AGENT_GATEWAY_PROMPT_COMPLETION_GRACE_MS,
        'AGENT_GATEWAY_PROMPT_COMPLETION_GRACE_MS',
      ),
      cancelGraceMs: parseInteger(
        env.AGENT_GATEWAY_CANCEL_GRACE_MS,
        'AGENT_GATEWAY_CANCEL_GRACE_MS',
      ),
      providerInitTimeoutMs: parseInteger(
        env.AGENT_GATEWAY_PROVIDER_INIT_TIMEOUT_MS,
        'AGENT_GATEWAY_PROVIDER_INIT_TIMEOUT_MS',
      ),
      packageManagerInitTimeoutMs: parseInteger(
        env.AGENT_GATEWAY_PACKAGE_MANAGER_INIT_TIMEOUT_MS,
        'AGENT_GATEWAY_PACKAGE_MANAGER_INIT_TIMEOUT_MS',
      ),
      providerRequestTimeoutMs: parseInteger(
        env.AGENT_GATEWAY_PROVIDER_REQUEST_TIMEOUT_MS,
        'AGENT_GATEWAY_PROVIDER_REQUEST_TIMEOUT_MS',
      ),
      minimumPromptTransportMs: parseInteger(
        env.AGENT_GATEWAY_MINIMUM_PROMPT_TRANSPORT_MS,
        'AGENT_GATEWAY_MINIMUM_PROMPT_TRANSPORT_MS',
      ),
    },
    retryAttempts: parseInteger(
      env.AGENT_GATEWAY_RETRY_ATTEMPTS,
      'AGENT_GATEWAY_RETRY_ATTEMPTS',
    ),
    maxConcurrentSessions: parseInteger(
      env.AGENT_GATEWAY_MAX_CONCURRENT_SESSIONS,
      'AGENT_GATEWAY_MAX_CONCURRENT_SESSIONS',
    ),
    logLevel: parseLogLevel(env.AGENT_GATEWAY_LOG_LEVEL),
  };
}

function normalizeConfig(config: GatewayConfigInput): GatewayConfig {
  const host = nonEmptyOrDefault(config.host, DEFAULT_CONFIG.host);
  const version = nonEmptyOrDefault(config.version, DEFAULT_CONFIG.version);
  const protocols = normalizeList(config.protocols, DEFAULT_CONFIG.protocols);
  const providers = normalizeList(config.providers, DEFAULT_CONFIG.providers);
  const defaultProvider = nonEmptyOrDefault(
    config.defaultProvider,
    config.providers?.[0] ?? DEFAULT_CONFIG.defaultProvider,
  );
  const port = positiveOrDefault(config.port, DEFAULT_CONFIG.port, 'port');
  const timeouts = normalizeTimeouts(config.timeouts, DEFAULT_CONFIG.timeouts);
  const retryAttempts = nonNegativeOrDefault(
    config.retryAttempts,
    DEFAULT_CONFIG.retryAttempts,
    'retryAttempts',
  );
  const maxConcurrentSessions = positiveOrDefault(
    config.maxConcurrentSessions,
    DEFAULT_CONFIG.maxConcurrentSessions,
    'maxConcurrentSessions',
  );
  const logLevel = config.logLevel ?? DEFAULT_CONFIG.logLevel;

  return {
    host,
    port,
    version,
    protocols,
    providers,
    defaultProvider,
    timeouts,
    retryAttempts,
    maxConcurrentSessions,
    logLevel,
  };
}

function normalizeTimeouts(
  value: Partial<GatewayTimeoutConfig> | undefined,
  fallback: GatewayTimeoutConfig,
): GatewayTimeoutConfig {
  return {
    promptTimeoutMs: positiveOrDefault(
      value?.promptTimeoutMs,
      fallback.promptTimeoutMs,
      'timeouts.promptTimeoutMs',
    ),
    promptCompletionGraceMs: positiveOrDefault(
      value?.promptCompletionGraceMs,
      fallback.promptCompletionGraceMs,
      'timeouts.promptCompletionGraceMs',
    ),
    cancelGraceMs: positiveOrDefault(
      value?.cancelGraceMs,
      fallback.cancelGraceMs,
      'timeouts.cancelGraceMs',
    ),
    providerInitTimeoutMs: positiveOrDefault(
      value?.providerInitTimeoutMs,
      fallback.providerInitTimeoutMs,
      'timeouts.providerInitTimeoutMs',
    ),
    packageManagerInitTimeoutMs: positiveOrDefault(
      value?.packageManagerInitTimeoutMs,
      fallback.packageManagerInitTimeoutMs,
      'timeouts.packageManagerInitTimeoutMs',
    ),
    providerRequestTimeoutMs: positiveOrDefault(
      value?.providerRequestTimeoutMs,
      fallback.providerRequestTimeoutMs,
      'timeouts.providerRequestTimeoutMs',
    ),
    minimumPromptTransportMs: positiveOrDefault(
      value?.minimumPromptTransportMs,
      fallback.minimumPromptTransportMs,
      'timeouts.minimumPromptTransportMs',
    ),
  };
}

function parseInteger(
  value: string | undefined,
  name: string,
): number | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be an integer, got: ${value}`);
  }

  return parsed;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }

  throw new Error(
    `AGENT_GATEWAY_LOG_LEVEL must be one of debug|info|warn|error, got: ${value}`,
  );
}

function nonEmptyOrDefault(
  value: string | undefined,
  fallback: string,
): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value;
}

function normalizeList(
  value: string[] | undefined,
  fallback: string[],
): string[] {
  if (!value || value.length === 0) {
    return fallback;
  }

  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : fallback;
}

function positiveOrDefault(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value == null) {
    return fallback;
  }
  if (value <= 0) {
    throw new Error(`${field} must be > 0, got: ${value}`);
  }
  return value;
}

function nonNegativeOrDefault(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value == null) {
    return fallback;
  }
  if (value < 0) {
    throw new Error(`${field} must be >= 0, got: ${value}`);
  }
  return value;
}
