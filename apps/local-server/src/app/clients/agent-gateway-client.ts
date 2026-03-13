import { ProblemError } from '../errors/problem-error';
import type {
  AcpProviderCatalogPayload,
  AcpProviderDistributionType,
  InstallAcpProviderPayload,
} from '../schemas/acp-provider';

const defaultRequestHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

interface GatewayJsonError {
  code?: string;
  message?: string;
  retryAfterMs?: number;
  retryable?: boolean;
}

export interface AgentGatewaySessionPayload {
  createdAt?: string;
  lastCursor?: string | null;
  metadata?: Record<string, unknown>;
  provider?: string;
  sessionId: string;
  state?: string;
  traceId?: string;
}

export interface AgentGatewayEventError {
  code: string;
  message: string;
  retryAfterMs: number;
  retryable: boolean;
}

export interface AgentGatewayEventEnvelope {
  cursor?: string;
  data?: Record<string, unknown>;
  emittedAt?: string;
  error?: AgentGatewayEventError | null;
  eventId?: string;
  sessionId?: string;
  traceId?: string;
  type: string;
}

export interface CreateAgentGatewaySessionInput {
  metadata?: Record<string, unknown>;
  provider?: string;
  traceId?: string;
}

export interface PromptAgentGatewaySessionInput {
  cwd?: string;
  env?: Record<string, string>;
  input: string;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
  traceId?: string;
}

export interface CancelAgentGatewaySessionInput {
  reason?: string;
  traceId?: string;
}

export interface AgentGatewayClient {
  cancel(
    sessionId: string,
    input?: CancelAgentGatewaySessionInput,
  ): Promise<{
    accepted: boolean;
    session: AgentGatewaySessionPayload;
  }>;
  createSession(
    input?: CreateAgentGatewaySessionInput,
  ): Promise<{
    session: AgentGatewaySessionPayload;
  }>;
  isConfigured(): boolean;
  isProviderConfigured(providerId: string): boolean;
  installProvider(input: {
    distributionType?: AcpProviderDistributionType;
    providerId: string;
  }): Promise<InstallAcpProviderPayload>;
  listProviders(options?: {
    includeRegistry?: boolean;
  }): Promise<AcpProviderCatalogPayload>;
  refreshProviderCatalog(options?: {
    includeRegistry?: boolean;
  }): Promise<AcpProviderCatalogPayload>;
  listEvents(
    sessionId: string,
    cursor?: string,
  ): Promise<{
    cursor?: string | null;
    events: AgentGatewayEventEnvelope[];
    nextCursor?: string | null;
    session: AgentGatewaySessionPayload;
  }>;
  prompt(
    sessionId: string,
    input: PromptAgentGatewaySessionInput,
  ): Promise<{
    accepted: boolean;
    runtime?: Record<string, unknown>;
    session: AgentGatewaySessionPayload;
  }>;
  stream(
    sessionId: string,
    options: {
      cursor?: string;
      onEvent: (event: { data: unknown; event: string }) => void;
    },
  ): Promise<void>;
}

export function createAgentGatewayClient(
  baseUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): AgentGatewayClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  let providerAvailability: Map<string, boolean> | null = null;

  const updateProviderAvailability = (payload: AcpProviderCatalogPayload) => {
    providerAvailability = new Map(
      payload.providers.map((provider) => [
        normalizeProviderId(provider.id),
        provider.status === 'available',
      ]),
    );
  };

  const loadProviderCatalog = async (options?: {
    includeRegistry?: boolean;
  }) => {
    const query =
      options?.includeRegistry === undefined
        ? ''
        : `?registry=${options.includeRegistry ? 'true' : 'false'}`;

    const payload = await requestJson<AcpProviderCatalogPayload>(
      fetchImpl,
      normalizedBaseUrl,
      {
        method: 'GET',
        path: `/providers${query}`,
      },
    );
    updateProviderAvailability(payload);
    return payload;
  };

  return {
    async cancel(sessionId, input) {
      return await requestJson(fetchImpl, normalizedBaseUrl, {
        method: 'POST',
        path: `/sessions/${encodeURIComponent(sessionId)}/cancel`,
        body: input ?? {},
      });
    },

    async createSession(input) {
      return await requestJson(fetchImpl, normalizedBaseUrl, {
        method: 'POST',
        path: '/sessions',
        body: input ?? {},
      });
    },

    isConfigured() {
      return normalizedBaseUrl !== null;
    },

    isProviderConfigured(providerId) {
      if (!normalizedBaseUrl) {
        return false;
      }

      if (providerAvailability === null) {
        return true;
      }

      return providerAvailability.get(normalizeProviderId(providerId)) ?? false;
    },

    async installProvider(input) {
      const payload = await requestJson<InstallAcpProviderPayload>(
        fetchImpl,
        normalizedBaseUrl,
        {
        method: 'POST',
        path: '/providers/install',
        body: input,
      });
      await loadProviderCatalog({ includeRegistry: true }).catch(() => undefined);
      return payload;
    },

    async listProviders(options) {
      return await loadProviderCatalog(options);
    },

    async refreshProviderCatalog(options) {
      return await loadProviderCatalog(options);
    },

    async listEvents(sessionId, cursor) {
      const query = cursor
        ? `?cursor=${encodeURIComponent(cursor)}`
        : '';

      return await requestJson(fetchImpl, normalizedBaseUrl, {
        method: 'GET',
        path: `/sessions/${encodeURIComponent(sessionId)}/events${query}`,
      });
    },

    async prompt(sessionId, input) {
      return await requestJson(fetchImpl, normalizedBaseUrl, {
        method: 'POST',
        path: `/sessions/${encodeURIComponent(sessionId)}/prompt`,
        body: input,
      });
    },

    async stream(sessionId, options) {
      ensureConfigured(normalizedBaseUrl);

      const query = options.cursor
        ? `?cursor=${encodeURIComponent(options.cursor)}`
        : '';
      const response = await performFetch(fetchImpl, `${normalizedBaseUrl}/sessions/${encodeURIComponent(sessionId)}/stream${query}`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      await consumeEventStream(response, options.onEvent);
    },
  };
}

function normalizeProviderId(providerName: string): string {
  const normalized = providerName.endsWith('-registry')
    ? providerName.slice(0, -'-registry'.length)
    : providerName;

  if (normalized === 'codex-acp') {
    return 'codex';
  }

  return normalized;
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) {
    return null;
  }

  const normalized = baseUrl.trim();
  return normalized.length > 0 ? normalized.replace(/\/+$/, '') : null;
}

function ensureConfigured(baseUrl: string | null): asserts baseUrl is string {
  if (baseUrl) {
    return;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/agent-gateway-unconfigured',
    title: 'Agent Gateway Unconfigured',
    status: 503,
    detail: 'AGENT_GATEWAY_BASE_URL is not configured',
  });
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string | null,
  options: {
    body?: unknown;
    method: 'GET' | 'POST';
    path: string;
  },
): Promise<T> {
  ensureConfigured(baseUrl);

  const response = await performFetch(fetchImpl, `${baseUrl}${options.path}`, {
    method: options.method,
    headers: defaultRequestHeaders,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return (await response.json()) as T;
}

async function performFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const response = await fetchImpl(url, init);

    if (response.ok) {
      return response;
    }

    const payload = await safeJson(response);
    const error = payload?.error as GatewayJsonError | undefined;
    const detail =
      error?.message ??
      (typeof payload?.detail === 'string' ? payload.detail : null) ??
      `Agent gateway request failed with status ${response.status}`;
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/agent-gateway-request-failed',
      title: 'Agent Gateway Request Failed',
      status: response.status,
      detail,
    });
  } catch (error) {
    if (error instanceof ProblemError) {
      throw error;
    }

    throw new ProblemError({
      type: 'https://team-ai.dev/problems/agent-gateway-unavailable',
      title: 'Agent Gateway Unavailable',
      status: 503,
      detail:
        error instanceof Error
          ? error.message
          : 'Agent gateway request failed',
    });
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function consumeEventStream(
  response: Response,
  onEvent: (event: { data: unknown; event: string }) => void,
): Promise<void> {
  if (!response.body) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (parsed) {
        onEvent(parsed);
      }
    }
  }

  const trailing = parseSseFrame(buffer);
  if (trailing) {
    onEvent(trailing);
  }
}

function parseSseFrame(frame: string): { data: unknown; event: string } | null {
  const lines = frame
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  const dataText = dataLines.join('\n');

  return {
    event,
    data: tryParseJson(dataText),
  };
}

function tryParseJson(value: string): unknown {
  if (value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
