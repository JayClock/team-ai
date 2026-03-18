import type {
  ContentBlock,
  McpServer,
  PromptResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import {
  flattenAcpContentText,
  hasStructuredValue,
} from '../services/canonical-acp-update';
import { ProblemError } from '../errors/problem-error';
import {
  AcpSessionProcessManager,
  type ManagedAcpSessionSnapshot,
} from './acp-session-process-manager';
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
import type { NormalizedSessionUpdate } from '../services/normalized-session-update';

const EVENT_POLL_INTERVAL_MS = 150;
const PROMPT_COMPLETION_GRACE_MS = 1_000;

interface ActiveGatewayRuntimeSession {
  cursor: string | null;
  cwd: string;
  gatewaySessionId: string;
  hooks: AcpRuntimeSessionHooks;
  localSessionId: string;
  mcpServers: McpServer[];
  model: string | null;
  provider: string;
}

interface WaitResult {
  stopReason: 'cancelled' | 'end_turn';
}

export function resolvePromptCompletionWaitTimeoutMs(
  timeoutMs: number | undefined,
): number | undefined {
  if (!timeoutMs || timeoutMs <= 0) {
    return undefined;
  }

  return timeoutMs + PROMPT_COMPLETION_GRACE_MS;
}

export function createAgentGatewayRuntimeClient(
  agentGatewayClient: AgentGatewayClient,
): AcpRuntimeClient {
  const sessionManager =
    new AcpSessionProcessManager<ActiveGatewayRuntimeSession>();

  async function createSession(
    input: CreateAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const created = await agentGatewayClient.createSession({
      model: input.model ?? undefined,
      provider: input.provider,
      metadata: {
        cwd: input.cwd,
        localSessionId: input.localSessionId,
        orchestration: input.orchestration ?? null,
      },
    });

    const session: ActiveGatewayRuntimeSession = {
      cursor: created.session.lastCursor ?? null,
      cwd: input.cwd,
      gatewaySessionId: created.session.sessionId,
      hooks: input.hooks,
      localSessionId: input.localSessionId,
      mcpServers: input.mcpServers,
      model: input.model ?? null,
      provider: input.provider,
    };
    await sessionManager.register({
      cleanup: async () => undefined,
      cwd: session.cwd,
      localSessionId: session.localSessionId,
      provider: session.provider,
      resource: session,
      runtimeSessionId: session.gatewaySessionId,
    });

    return {
      provider: input.provider,
      runtimeSessionId: created.session.sessionId,
    };
  }

  async function loadSession(
    input: LoadAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const existing = sessionManager.get(input.localSessionId)?.resource;
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
      const session: ActiveGatewayRuntimeSession = {
        cursor: response.nextCursor ?? response.session.lastCursor ?? null,
        cwd: input.cwd,
        gatewaySessionId: input.runtimeSessionId,
        hooks: input.hooks,
        localSessionId: input.localSessionId,
        mcpServers: input.mcpServers,
        model: input.model ?? null,
        provider: input.provider,
      };
      await sessionManager.register({
        cleanup: async () => undefined,
        cwd: session.cwd,
        localSessionId: session.localSessionId,
        provider: session.provider,
        resource: session,
        runtimeSessionId: session.gatewaySessionId,
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
    return sessionManager.withActivity(
      input.localSessionId,
      async ({ resource: session }) => {
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
      },
    );
  }

  async function cancelSession(
    input: CancelAcpRuntimeSessionInput,
  ): Promise<void> {
    await sessionManager.withActivity(
      input.localSessionId,
      async ({ resource: session }) => {
        await agentGatewayClient.cancel(session.gatewaySessionId, {
          reason: input.reason,
        });
      },
    );
  }

  async function killSession(localSessionId: string): Promise<void> {
    await sessionManager.remove(localSessionId);
  }

  function isConfigured(provider: string): boolean {
    return agentGatewayClient.isProviderConfigured(provider);
  }

  function isSessionActive(localSessionId: string): boolean {
    return sessionManager.has(localSessionId);
  }

  async function close(): Promise<void> {
    await sessionManager.close();
  }

  return {
    cancelSession,
    close,
    createSession,
    isConfigured,
    isSessionActive,
    killSession,
    listSessions: (): ManagedAcpSessionSnapshot[] => sessionManager.list(),
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
  model: string | undefined;
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
    model: session.model ?? undefined,
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
  const deadlineMs = resolvePromptCompletionWaitTimeoutMs(timeoutMs);

  while (true) {
    const completion = await flushGatewayEvents(agentGatewayClient, session);
    if (completion) {
      return completion;
    }

    if (deadlineMs && Date.now() - startedAt > deadlineMs) {
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
    const update = toRuntimeSessionUpdate(event, session.provider);
    if (update) {
      await session.hooks.onSessionUpdate(update);
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

function toRuntimeSessionUpdate(
  event: AgentGatewayEventEnvelope,
  provider: string,
): NormalizedSessionUpdate | null {
  const canonicalUpdate =
    event.data && typeof event.data === 'object'
      ? ((event.data as Record<string, unknown>).update as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const normalizedUpdate =
    canonicalUpdate &&
    toNormalizedGatewayUpdate(canonicalUpdate, provider, event);
  return normalizedUpdate ?? null;
}

function toCanonicalSessionNotification(
  update: Record<string, unknown>,
  sessionId?: string,
): SessionNotification | null {
  const eventType = asString(update.eventType);
  if (!eventType) {
    return null;
  }

  switch (eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'user_message': {
      const message = asRecord(update.message);
      const roleSessionUpdate =
        eventType === 'user_message'
          ? 'user_message'
          : eventType === 'agent_thought'
            ? 'agent_thought'
            : 'agent_message';
      const suffix = message.isChunk === false ? '' : '_chunk';

      return createSessionNotification(
        {
          sessionUpdate: `${roleSessionUpdate}${suffix}`,
          ...(asString(message.messageId)
            ? { messageId: asString(message.messageId) ?? undefined }
            : {}),
          content: toContentBlock(
            message.contentBlock ?? message.content ?? '',
          ),
        },
        sessionId,
      );
    }

    case 'tool_call':
    case 'tool_call_update': {
      const toolCall = asRecord(update.toolCall);
      return createSessionNotification(
        {
          sessionUpdate: eventType,
          ...(asString(toolCall.toolCallId)
            ? { toolCallId: asString(toolCall.toolCallId) ?? undefined }
            : {}),
          ...(asString(toolCall.title)
            ? { title: asString(toolCall.title) ?? undefined }
            : {}),
          ...(asString(toolCall.kind)
            ? { kind: asString(toolCall.kind) ?? undefined }
            : {}),
          status: asString(toolCall.status) ?? 'pending',
          rawInput: toolCall.input ?? null,
          rawOutput: toolCall.output ?? null,
          locations: Array.isArray(toolCall.locations)
            ? toolCall.locations
            : [],
          content: Array.isArray(toolCall.content) ? toolCall.content : [],
        },
        sessionId,
      );
    }

    case 'terminal_created':
    case 'terminal_output':
    case 'terminal_exited': {
      const terminal = asRecord(update.terminal);
      return createSessionNotification(
        {
          sessionUpdate: eventType,
          ...(asString(terminal.terminalId)
            ? { terminalId: asString(terminal.terminalId) ?? undefined }
            : {}),
          ...(asString(terminal.command)
            ? { command: asString(terminal.command) ?? undefined }
            : {}),
          args: Array.isArray(terminal.args) ? terminal.args : [],
          ...(typeof terminal.interactive === 'boolean'
            ? { interactive: terminal.interactive }
            : {}),
          ...(asString(terminal.data)
            ? { data: asString(terminal.data) ?? undefined }
            : {}),
          ...(typeof terminal.exitCode === 'number' ||
          terminal.exitCode === null
            ? { exitCode: terminal.exitCode }
            : {}),
        },
        sessionId,
      );
    }

    case 'plan_update':
      return createSessionNotification(
        {
          sessionUpdate: 'plan',
          entries: Array.isArray(update.planItems)
            ? update.planItems.map((item) => ({
                content:
                  asString(asRecord(item).description) ??
                  asString(asRecord(item).content) ??
                  '',
                ...(asString(asRecord(item).priority)
                  ? { priority: asString(asRecord(item).priority) ?? undefined }
                  : {}),
                ...(asString(asRecord(item).status)
                  ? { status: asString(asRecord(item).status) ?? undefined }
                  : {}),
              }))
            : [],
        },
        sessionId,
      );

    case 'turn_complete': {
      const turnComplete = asRecord(update.turnComplete);
      return createSessionNotification(
        {
          sessionUpdate: 'turn_complete',
          ...(asString(turnComplete.state)
            ? { state: asString(turnComplete.state) ?? undefined }
            : {}),
          stopReason: asString(turnComplete.stopReason) ?? 'end_turn',
          usage: turnComplete.usage ?? null,
          userMessageId: asString(turnComplete.userMessageId),
        },
        sessionId,
      );
    }

    case 'session_info_update': {
      const sessionInfo = asRecord(update.sessionInfo);
      return createSessionNotification(
        {
          sessionUpdate: 'session_info_update',
          ...(asString(sessionInfo.title)
            ? { title: asString(sessionInfo.title) ?? undefined }
            : {}),
          ...(asString(sessionInfo.updatedAt)
            ? { updatedAt: asString(sessionInfo.updatedAt) ?? undefined }
            : {}),
        },
        sessionId,
      );
    }

    case 'current_mode_update': {
      const mode = asRecord(update.mode);
      return createSessionNotification(
        {
          sessionUpdate: 'current_mode_update',
          ...(asString(mode.currentModeId)
            ? { currentModeId: asString(mode.currentModeId) ?? undefined }
            : {}),
        },
        sessionId,
      );
    }

    case 'config_option_update':
      return createSessionNotification(
        {
          sessionUpdate: 'config_option_update',
          configOptions: update.configOptions ?? {},
        },
        sessionId,
      );

    case 'usage_update': {
      const usage = asRecord(update.usage);
      return createSessionNotification(
        {
          sessionUpdate: 'usage_update',
          size: asNumber(usage.size) ?? 0,
          used: asNumber(usage.used) ?? 0,
          cost: usage.cost ?? null,
        },
        sessionId,
      );
    }

    case 'available_commands_update':
      return createSessionNotification(
        {
          sessionUpdate: 'available_commands_update',
          availableCommands: Array.isArray(update.availableCommands)
            ? update.availableCommands
            : [],
        },
        sessionId,
      );

    case 'error': {
      const error = asRecord(update.error);
      return createSessionNotification(
        {
          sessionUpdate: 'error',
          code: asString(error.code) ?? 'PROTOCOL_ERROR',
          message: asString(error.message) ?? 'Unknown protocol error',
        },
        sessionId,
      );
    }

    default:
      return null;
  }
}

function toNormalizedGatewayUpdate(
  update: Record<string, unknown>,
  provider: string,
  event: AgentGatewayEventEnvelope,
): NormalizedSessionUpdate | null {
  const eventType = asNormalizedEventType(update.eventType);
  if (!eventType) {
    return null;
  }

  const sessionId = asString(update.sessionId) ?? event.sessionId ?? '';
  const traceId = asString(update.traceId) ?? event.traceId ?? undefined;
  const timestamp =
    asString(update.timestamp) ?? event.emittedAt ?? new Date().toISOString();
  const rawNotification =
    toCanonicalSessionNotification(update, sessionId) ??
    createSessionNotification(
      {
        sessionUpdate: fallbackSessionUpdate(eventType),
      },
      sessionId,
    );

  const normalized: NormalizedSessionUpdate = {
    eventType,
    provider: asString(update.provider) ?? provider,
    rawNotification,
    sessionId,
    timestamp,
    ...(traceId ? { traceId } : {}),
  };

  const message = asRecord(update.message);
  if (
    eventType === 'agent_message' ||
    eventType === 'agent_thought' ||
    eventType === 'user_message'
  ) {
    normalized.message = {
      role:
        eventType === 'user_message'
          ? 'user'
          : eventType === 'agent_thought'
            ? 'thought'
            : 'assistant',
      messageId: asString(message.messageId),
      content:
        asString(message.content) ??
        flattenAcpContentText(message.contentBlock) ??
        null,
      contentBlock: toContentBlock(
        message.contentBlock ?? message.content ?? '',
      ),
      isChunk: message.isChunk !== false,
    };
  }

  const toolCall = asRecord(update.toolCall);
  if (eventType === 'tool_call' || eventType === 'tool_call_update') {
    normalized.toolCall = {
      toolCallId: asString(toolCall.toolCallId) ?? undefined,
      title: asString(toolCall.title),
      kind: asString(toolCall.kind),
      status: normalizeToolCallStatus(toolCall.status),
      input: toolCall.input ?? null,
      inputFinalized:
        typeof toolCall.inputFinalized === 'boolean'
          ? toolCall.inputFinalized
          : hasStructuredValue(toolCall.input),
      output: toolCall.output ?? null,
      locations: Array.isArray(toolCall.locations) ? toolCall.locations : [],
      content: Array.isArray(toolCall.content) ? toolCall.content : [],
    };
  }

  if (
    eventType === 'terminal_created' ||
    eventType === 'terminal_output' ||
    eventType === 'terminal_exited'
  ) {
    const terminal = asRecord(update.terminal);
    normalized.terminal = {
      terminalId: asString(terminal.terminalId) ?? 'unknown-terminal',
      ...(asString(terminal.command)
        ? { command: asString(terminal.command) }
        : {}),
      ...(Array.isArray(terminal.args)
        ? {
            args: terminal.args.filter(
              (value): value is string => typeof value === 'string',
            ),
          }
        : {}),
      ...(typeof terminal.interactive === 'boolean'
        ? { interactive: terminal.interactive }
        : {}),
      ...(asString(terminal.data) ? { data: asString(terminal.data) } : {}),
      ...(typeof terminal.exitCode === 'number' || terminal.exitCode === null
        ? { exitCode: terminal.exitCode as number | null }
        : {}),
    };
  }

  if (eventType === 'plan_update') {
    normalized.planItems = Array.isArray(update.planItems)
      ? update.planItems.map((item) => {
          const record = asRecord(item);
          return {
            description:
              asString(record.description) ?? asString(record.content) ?? '',
            ...(isPlanPriority(record.priority)
              ? { priority: record.priority }
              : {}),
            ...(isPlanStatus(record.status) ? { status: record.status } : {}),
          };
        })
      : [];
  }

  if (eventType === 'session_info_update') {
    const sessionInfo = asRecord(update.sessionInfo);
    normalized.sessionInfo = {
      title: asString(sessionInfo.title),
      updatedAt: asString(sessionInfo.updatedAt),
    };
  }

  if (eventType === 'current_mode_update') {
    const mode = asRecord(update.mode);
    normalized.mode = {
      ...(asString(mode.currentModeId)
        ? { currentModeId: asString(mode.currentModeId) ?? undefined }
        : {}),
    };
  }

  if (eventType === 'config_option_update') {
    normalized.configOptions = update.configOptions ?? {};
  }

  if (eventType === 'usage_update') {
    const usage = asRecord(update.usage);
    normalized.usage = {
      size: asNumber(usage.size) ?? 0,
      used: asNumber(usage.used) ?? 0,
      cost: usage.cost ?? null,
    };
  }

  if (eventType === 'available_commands_update') {
    normalized.availableCommands = Array.isArray(update.availableCommands)
      ? update.availableCommands
      : [];
  }

  if (eventType === 'error') {
    const error = asRecord(update.error);
    normalized.error = {
      code: asString(error.code) ?? 'PROTOCOL_ERROR',
      message: asString(error.message) ?? 'Unknown protocol error',
    };
  }

  if (eventType === 'turn_complete') {
    const turnComplete = asRecord(update.turnComplete);
    normalized.turnComplete = {
      stopReason: asString(turnComplete.stopReason) ?? 'end_turn',
      usage: turnComplete.usage ?? null,
      userMessageId: asString(turnComplete.userMessageId),
      ...(isTerminalState(turnComplete.state)
        ? { state: turnComplete.state }
        : {}),
    };
  }

  return normalized;
}

function toContentBlock(content: unknown): ContentBlock {
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      return record as ContentBlock;
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
  const update =
    event.data && typeof event.data === 'object'
      ? asRecord((event.data as Record<string, unknown>).update)
      : {};
  const turnComplete = asRecord(update.turnComplete);
  const reason =
    event.data && typeof event.data === 'object'
      ? asString((event.data as Record<string, unknown>).reason)
      : null;

  const canonicalReason = asString(turnComplete.stopReason);
  const effectiveReason = reason ?? canonicalReason;

  return effectiveReason === 'cancelled' ? 'cancelled' : 'end_turn';
}

function isSessionNotFound(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 404;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function createSessionNotification(
  update: Record<string, unknown>,
  sessionId?: string,
): SessionNotification {
  return {
    sessionId: sessionId ?? '',
    update,
  } as unknown as SessionNotification;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNormalizedEventType(
  value: unknown,
): NormalizedSessionUpdate['eventType'] | null {
  switch (value) {
    case 'tool_call':
    case 'tool_call_update':
    case 'agent_message':
    case 'agent_thought':
    case 'user_message':
    case 'terminal_created':
    case 'terminal_output':
    case 'terminal_exited':
    case 'plan_update':
    case 'turn_complete':
    case 'session_info_update':
    case 'current_mode_update':
    case 'config_option_update':
    case 'usage_update':
    case 'available_commands_update':
    case 'error':
      return value;
    default:
      return null;
  }
}

function fallbackSessionUpdate(
  eventType: NormalizedSessionUpdate['eventType'],
): string {
  switch (eventType) {
    case 'agent_message':
      return 'agent_message_chunk';
    case 'agent_thought':
      return 'agent_thought_chunk';
    case 'user_message':
      return 'user_message_chunk';
    case 'plan_update':
      return 'plan';
    default:
      return eventType;
  }
}

function normalizeToolCallStatus(
  value: unknown,
): 'completed' | 'failed' | 'pending' | 'running' {
  if (
    value === 'completed' ||
    value === 'failed' ||
    value === 'pending' ||
    value === 'running'
  ) {
    return value;
  }

  return 'pending';
}

function isPlanPriority(value: unknown): value is 'high' | 'low' | 'medium' {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isPlanStatus(
  value: unknown,
): value is 'completed' | 'in_progress' | 'pending' {
  return (
    value === 'completed' || value === 'in_progress' || value === 'pending'
  );
}

function isTerminalState(value: unknown): value is 'FAILED' | 'CANCELLED' {
  return value === 'FAILED' || value === 'CANCELLED';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
