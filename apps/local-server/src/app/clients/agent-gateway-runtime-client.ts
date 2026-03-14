import type {
  McpServer,
  PromptResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import { ProblemError } from '../errors/problem-error';
import type {
  AgentGatewayClient,
  AgentGatewayEventEnvelope,
} from './agent-gateway-client';
import type {
  AcpPromptRuntimeResult,
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
  AcpRuntimeSessionSnapshot,
  CancelAcpRuntimeSessionInput,
  CreateAcpRuntimeSessionInput,
  LoadAcpRuntimeSessionInput,
  PromptAcpRuntimeSessionInput,
} from './acp-runtime-client';

const EVENT_POLL_INTERVAL_MS = 150;

interface ActiveGatewayRuntimeSession {
  cursor: string | null;
  cwd: string;
  gatewaySessionId: string;
  hooks: AcpRuntimeSessionHooks;
  localSessionId: string;
  mcpServers: McpServer[];
  provider: string;
}

interface WaitResult {
  stopReason: 'cancelled' | 'end_turn';
}

export function createAgentGatewayRuntimeClient(
  agentGatewayClient: AgentGatewayClient,
): AcpRuntimeClient {
  const sessions = new Map<string, ActiveGatewayRuntimeSession>();

  function getSession(localSessionId: string): ActiveGatewayRuntimeSession {
    const session = sessions.get(localSessionId);
    if (!session) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/acp-session-runtime-not-loaded',
        title: 'ACP Session Runtime Not Loaded',
        status: 409,
        detail: `ACP runtime for session ${localSessionId} is not loaded`,
      });
    }

    return session;
  }

  async function createSession(
    input: CreateAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const created = await agentGatewayClient.createSession({
      provider: input.provider,
      metadata: {
        cwd: input.cwd,
        localSessionId: input.localSessionId,
      },
    });

    sessions.set(input.localSessionId, {
      cursor: created.session.lastCursor ?? null,
      cwd: input.cwd,
      gatewaySessionId: created.session.sessionId,
      hooks: input.hooks,
      localSessionId: input.localSessionId,
      mcpServers: input.mcpServers,
      provider: input.provider,
    });

    return {
      provider: input.provider,
      runtimeSessionId: created.session.sessionId,
    };
  }

  async function loadSession(
    input: LoadAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const existing = sessions.get(input.localSessionId);
    if (existing) {
      return {
        provider: existing.provider,
        runtimeSessionId: existing.gatewaySessionId,
      };
    }

    try {
      const response = await agentGatewayClient.listEvents(
        input.runtimeSessionId,
      );
      sessions.set(input.localSessionId, {
        cursor: response.nextCursor ?? response.session.lastCursor ?? null,
        cwd: input.cwd,
        gatewaySessionId: input.runtimeSessionId,
        hooks: input.hooks,
        localSessionId: input.localSessionId,
        mcpServers: input.mcpServers,
        provider: input.provider,
      });

      return {
        provider: input.provider,
        runtimeSessionId: input.runtimeSessionId,
      };
    } catch (error) {
      if (!isSessionNotFound(error)) {
        throw error;
      }

      return await createSession(input);
    }
  }

  async function promptSession(
    input: PromptAcpRuntimeSessionInput,
  ): Promise<AcpPromptRuntimeResult> {
    const session = getSession(input.localSessionId);
    const gatewayPrompt = buildGatewayPromptInput(session, input);

    await agentGatewayClient.prompt(session.gatewaySessionId, gatewayPrompt);

    const waitResult = await waitForPromptCompletion(
      agentGatewayClient,
      session,
      input.timeoutMs,
    );

    return {
      runtimeSessionId: session.gatewaySessionId,
      response: {
        stopReason: waitResult.stopReason,
        userMessageId: null,
        usage: null,
      } as PromptResponse,
    };
  }

  async function cancelSession(
    input: CancelAcpRuntimeSessionInput,
  ): Promise<void> {
    const session = getSession(input.localSessionId);
    await agentGatewayClient.cancel(session.gatewaySessionId, {
      reason: input.reason,
    });
  }

  async function deleteSession(localSessionId: string): Promise<void> {
    sessions.delete(localSessionId);
  }

  async function close(): Promise<void> {
    sessions.clear();
  }

  function isConfigured(provider: string): boolean {
    return agentGatewayClient.isProviderConfigured(provider);
  }

  function isSessionActive(localSessionId: string): boolean {
    return sessions.has(localSessionId);
  }

  return {
    cancelSession,
    close,
    createSession,
    deleteSession,
    isConfigured,
    isSessionActive,
    loadSession,
    promptSession,
  };
}

function buildGatewayPromptInput(
  session: ActiveGatewayRuntimeSession,
  input: PromptAcpRuntimeSessionInput,
): {
  cwd: string;
  env: Record<string, string> | undefined;
  input: string;
  metadata: Record<string, unknown> | undefined;
  timeoutMs: number | undefined;
  traceId: string | undefined;
} {
  const metadataServers: Array<Record<string, unknown>> = [];
  const env: Record<string, string> = {};

  for (const server of session.mcpServers) {
    const metadataServer = toGatewayMcpServer(server, env);
    if (metadataServer) {
      metadataServers.push(metadataServer);
    }
  }

  return {
    input: input.prompt,
    timeoutMs: input.timeoutMs,
    traceId: input.traceId,
    cwd: session.cwd,
    env: Object.keys(env).length > 0 ? env : undefined,
    metadata:
      metadataServers.length > 0
        ? {
            mcpServers: metadataServers,
          }
        : undefined,
  };
}

async function waitForPromptCompletion(
  agentGatewayClient: AgentGatewayClient,
  session: ActiveGatewayRuntimeSession,
  timeoutMs?: number,
): Promise<WaitResult> {
  const startedAt = Date.now();

  while (true) {
    const completion = await flushGatewayEvents(agentGatewayClient, session);
    if (completion) {
      return completion;
    }

    if (
      timeoutMs &&
      timeoutMs > 0 &&
      Date.now() - startedAt > timeoutMs + 5_000
    ) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/acp-prompt-timeout',
        title: 'ACP Prompt Timed Out',
        status: 504,
        detail: `ACP prompt exceeded timeout of ${timeoutMs}ms`,
      });
    }

    await sleep(EVENT_POLL_INTERVAL_MS);
  }
}

async function flushGatewayEvents(
  agentGatewayClient: AgentGatewayClient,
  session: ActiveGatewayRuntimeSession,
): Promise<WaitResult | null> {
  const response = await agentGatewayClient.listEvents(
    session.gatewaySessionId,
    session.cursor ?? undefined,
  );
  session.cursor =
    response.nextCursor ?? response.session.lastCursor ?? session.cursor;

  for (const event of response.events) {
    const notification = toSessionNotification(event);
    if (notification) {
      await session.hooks.onSessionUpdate(notification);
    }

    if (event.type === 'error') {
      const detail = event.error?.message ?? 'Agent gateway prompt failed';
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/agent-gateway-prompt-failed',
        title: 'Agent Gateway Prompt Failed',
        status: 502,
        detail,
      });
    }

    if (event.type === 'complete') {
      return {
        stopReason: resolveStopReason(event),
      };
    }
  }

  if (response.session.state === 'FAILED') {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/agent-gateway-prompt-failed',
      title: 'Agent Gateway Prompt Failed',
      status: 502,
      detail: `Agent gateway session ${session.gatewaySessionId} failed`,
    });
  }

  if (response.session.state === 'CANCELLED') {
    return {
      stopReason: 'cancelled',
    };
  }

  return null;
}

function toGatewayMcpServer(
  server: McpServer,
  env: Record<string, string>,
): Record<string, unknown> | null {
  if (!('url' in server) || typeof server.url !== 'string') {
    return null;
  }

  const metadata: Record<string, unknown> = {
    name: server.name,
    url: server.url,
  };

  const headerList = 'headers' in server ? server.headers : undefined;
  if (Array.isArray(headerList) && headerList.length > 0) {
    const headers = headerList.map(
      (header: { name: string; value: string }) => ({
        name: header.name,
        value: header.value,
      }),
    );
    metadata.headers = headers;

    const authorizationHeader = headers.find(
      (header) => header.name.toLowerCase() === 'authorization',
    );
    if (authorizationHeader?.value.startsWith('Bearer ')) {
      const envName = `TEAMAI_MCP_${normalizeEnvSegment(server.name)}_BEARER_TOKEN`;
      env[envName] = authorizationHeader.value.slice('Bearer '.length);
      metadata.bearerTokenEnvVar = envName;
    }
  }

  return metadata;
}

function normalizeEnvSegment(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function toSessionNotification(
  event: AgentGatewayEventEnvelope,
): SessionNotification | null {
  const payload =
    event.data && typeof event.data === 'object'
      ? ((event.data as Record<string, unknown>).payload as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const text =
    event.data && typeof event.data === 'object'
      ? ((event.data as Record<string, unknown>).text as string | undefined)
      : undefined;

  const update = toSessionUpdatePayload(payload, text);
  if (!update) {
    return null;
  }

  return {
    update,
  } as SessionNotification;
}

function toSessionUpdatePayload(
  payload: Record<string, unknown> | undefined,
  text: string | undefined,
): Record<string, unknown> | null {
  const sessionUpdate =
    asString(payload?.sessionUpdate) ?? asString(payload?.type) ?? null;

  if (!sessionUpdate && text) {
    return {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text,
      },
    };
  }

  switch (sessionUpdate) {
    case 'user_message_chunk':
    case 'agent_message_chunk':
    case 'agent_thought_chunk':
      return {
        sessionUpdate,
        messageId: asString(payload?.messageId) ?? undefined,
        content: toContentBlock(payload?.content ?? text ?? ''),
      };
    case 'tool_call':
      return {
        sessionUpdate: 'tool_call',
        toolCallId:
          asString(payload?.toolCallId) ??
          asString(payload?.toolName) ??
          undefined,
        title:
          asString(payload?.title) ?? asString(payload?.toolName) ?? undefined,
        status: asString(payload?.status) ?? 'running',
        kind:
          asString(payload?.kind) ?? asString(payload?.toolName) ?? undefined,
        rawInput: payload?.rawInput ?? payload?.arguments ?? null,
        rawOutput: payload?.rawOutput ?? null,
        locations: Array.isArray(payload?.locations) ? payload?.locations : [],
        content: Array.isArray(payload?.content) ? payload?.content : [],
      };
    case 'tool_result':
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId:
          asString(payload?.toolCallId) ??
          asString(payload?.toolName) ??
          undefined,
        title:
          asString(payload?.title) ?? asString(payload?.toolName) ?? undefined,
        status: 'completed',
        kind:
          asString(payload?.kind) ?? asString(payload?.toolName) ?? undefined,
        rawInput: payload?.rawInput ?? payload?.arguments ?? null,
        rawOutput: payload?.rawOutput ?? payload?.output ?? null,
        locations: Array.isArray(payload?.locations) ? payload?.locations : [],
        content: Array.isArray(payload?.content) ? payload?.content : [],
      };
    case 'plan_update':
      return {
        sessionUpdate: 'plan',
        entries: Array.isArray(payload?.items)
          ? payload?.items.map((item) => ({
              content:
                asString((item as Record<string, unknown>).description) ?? '',
              status:
                asString((item as Record<string, unknown>).status) ?? 'pending',
            }))
          : [],
      };
    case 'session_info_update':
      return {
        sessionUpdate: 'session_info_update',
        title: asString(payload?.title) ?? undefined,
        updatedAt: asString(payload?.updatedAt) ?? undefined,
      };
    case 'current_mode_update':
      return {
        sessionUpdate: 'current_mode_update',
        currentModeId: asString(payload?.currentModeId) ?? undefined,
      };
    case 'config_option_update':
      return {
        sessionUpdate: 'config_option_update',
        configOptions: payload?.configOptions ?? {},
      };
    case 'usage_update':
      return {
        sessionUpdate: 'usage_update',
        size: asNumber(payload?.size) ?? 0,
        used: asNumber(payload?.used) ?? 0,
        cost: asNumber(payload?.cost) ?? undefined,
      };
    default:
      return null;
  }
}

function toContentBlock(content: unknown): Record<string, unknown> {
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      return record;
    }
  }

  return {
    type: 'text',
    text: typeof content === 'string' ? content : '',
  };
}

function resolveStopReason(
  event: AgentGatewayEventEnvelope,
): 'cancelled' | 'end_turn' {
  const reason =
    event.data && typeof event.data === 'object'
      ? asString((event.data as Record<string, unknown>).reason)
      : null;

  return reason === 'cancelled' ? 'cancelled' : 'end_turn';
}

function isSessionNotFound(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 404;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
