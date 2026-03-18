import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type GatewayConfig = {
  host: string;
  port: number;
  version: string;
  protocols: string[];
  providers: string[];
  defaultProvider: string;
  timeoutMs: number;
  retryAttempts: number;
  maxConcurrentSessions: number;
  logLevel: LogLevel;
};

type PartialGatewayConfig = Partial<GatewayConfig>;

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
  timeoutMs: 300_000,
  retryAttempts: 2,
  maxConcurrentSessions: 32,
  logLevel: 'info',
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  const fileConfig = loadFileConfig(env.AGENT_GATEWAY_CONFIG_FILE);
  const envConfig = loadEnvConfig(env);

  const merged = applyDefined(
    applyDefined(DEFAULT_CONFIG, fileConfig),
    envConfig,
  );

  return normalizeConfig(merged);
}

function loadFileConfig(configPath?: string): PartialGatewayConfig {
  if (!configPath) {
    return {};
  }

  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`AGENT_GATEWAY_CONFIG_FILE not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw) as PartialGatewayConfig;
  return parsed;
}

function loadEnvConfig(env: NodeJS.ProcessEnv): PartialGatewayConfig {
  return {
    host: env.AGENT_GATEWAY_HOST,
    port: parseInteger(env.AGENT_GATEWAY_PORT, 'AGENT_GATEWAY_PORT'),
    version: env.AGENT_GATEWAY_VERSION,
    protocols: parseCsv(env.AGENT_GATEWAY_PROTOCOLS),
    providers: parseCsv(env.AGENT_GATEWAY_PROVIDERS),
    defaultProvider: env.AGENT_GATEWAY_DEFAULT_PROVIDER,
    timeoutMs: parseInteger(
      env.AGENT_GATEWAY_TIMEOUT_MS,
      'AGENT_GATEWAY_TIMEOUT_MS',
    ),
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

function normalizeConfig(config: PartialGatewayConfig): GatewayConfig {
  const host = nonEmptyOrDefault(config.host, DEFAULT_CONFIG.host);
  const version = nonEmptyOrDefault(config.version, DEFAULT_CONFIG.version);
  const protocols = normalizeList(config.protocols, DEFAULT_CONFIG.protocols);
  const providers = normalizeList(config.providers, DEFAULT_CONFIG.providers);
  const defaultProvider = nonEmptyOrDefault(
    config.defaultProvider,
    config.providers?.[0] ?? DEFAULT_CONFIG.defaultProvider,
  );
  const port = positiveOrDefault(config.port, DEFAULT_CONFIG.port, 'port');
  const timeoutMs = positiveOrDefault(
    config.timeoutMs,
    DEFAULT_CONFIG.timeoutMs,
    'timeoutMs',
  );
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
    timeoutMs,
    retryAttempts,
    maxConcurrentSessions,
    logLevel,
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

function applyDefined<T extends object>(base: T, override: Partial<T>): T {
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
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
