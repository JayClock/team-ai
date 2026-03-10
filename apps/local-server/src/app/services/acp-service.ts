import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type {
  AgentGatewayClient,
  AgentGatewayEventEnvelope,
  AgentGatewayEventError,
} from '../clients/agent-gateway-client';
import { ProblemError } from '../errors/problem-error';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import type {
  AcpEventEnvelopePayload,
  AcpEventErrorPayload,
  AcpSessionListPayload,
  AcpSessionPayload,
  AcpSessionState,
  AcpEventTypePayload,
} from '../schemas/acp';
import { getProjectById } from './project-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  16,
);
const gatewayPollIntervalMs = 250;

interface AcpSessionRow {
  actor_id: string;
  completed_at: string | null;
  failure_reason: string | null;
  id: string;
  last_activity_at: string | null;
  last_event_id: string | null;
  mode: string;
  name: string | null;
  parent_session_id: string | null;
  project_id: string;
  provider: string;
  runtime_session_id: string | null;
  started_at: string | null;
  state: AcpSessionState;
}

interface AcpEventRow {
  emitted_at: string;
  error_json: string | null;
  event_id: string;
  payload_json: string;
  session_id: string;
  type: string;
}

type NormalizedGatewayEvent = {
  error?: AcpEventErrorPayload | null;
  payload: Record<string, unknown>;
  type: AcpEventTypePayload;
};

interface ListSessionsQuery {
  page: number;
  pageSize: number;
}

interface CreateSessionInput {
  actorUserId: string;
  goal?: string;
  mode: string;
  parentSessionId?: string | null;
  projectId: string;
  provider: string;
}

interface PromptSessionInput {
  eventId?: string;
  prompt: string;
  timeoutMs?: number;
  traceId?: string;
}

interface LocalMcpServerConfig {
  bearerTokenEnvVar?: string;
  name: string;
  url: string;
}

const activeGatewayPolls = new Map<string, Promise<void>>();

function createSessionId() {
  return `acps_${sessionIdGenerator()}`;
}

function createEventId() {
  return `acpe_${eventIdGenerator()}`;
}

function resolveLocalMcpServer(): LocalMcpServerConfig | null {
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const port = process.env.PORT?.trim();

  if (!port) {
    return null;
  }

  return {
    name: 'team_ai_local',
    url: `http://${host}:${port}/api/mcp`,
    bearerTokenEnvVar: 'TEAMAI_DESKTOP_SESSION_TOKEN',
  };
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-not-found',
    title: 'ACP Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
  });
}

function mapSessionRow(row: AcpSessionRow): AcpSessionPayload {
  return {
    id: row.id,
    project: { id: row.project_id },
    actor: { id: row.actor_id },
    parentSession: row.parent_session_id ? { id: row.parent_session_id } : null,
    name: row.name,
    provider: row.provider,
    mode: row.mode,
    state: row.state,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    lastEventId: row.last_event_id ? { id: row.last_event_id } : null,
  };
}

function mapEventRow(row: AcpEventRow): AcpEventEnvelopePayload {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    type: row.type as AcpEventTypePayload,
    emittedAt: row.emitted_at,
    data: JSON.parse(row.payload_json) as Record<string, unknown>,
    error: row.error_json
      ? (JSON.parse(row.error_json) as AcpEventErrorPayload)
      : null,
  };
}

function getSessionRow(sqlite: Database, sessionId: string): AcpSessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          actor_id,
          parent_session_id,
          name,
          provider,
          mode,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as AcpSessionRow | undefined;

  if (!row) {
    throwSessionNotFound(sessionId);
  }

  return row;
}

function updateSessionRuntime(
  sqlite: Database,
  sessionId: string,
  update: {
    completedAt?: string | null;
    failureReason?: string | null;
    lastActivityAt?: string | null;
    lastEventId?: string | null;
    runtimeSessionId?: string | null;
    startedAt?: string | null;
    state?: AcpSessionState;
  },
) {
  const current = getSessionRow(sqlite, sessionId);
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET
          runtime_session_id = @runtimeSessionId,
          state = @state,
          failure_reason = @failureReason,
          last_event_id = @lastEventId,
          started_at = @startedAt,
          last_activity_at = @lastActivityAt,
          completed_at = @completedAt,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: sessionId,
      runtimeSessionId: update.runtimeSessionId ?? current.runtime_session_id,
      state: update.state ?? current.state,
      failureReason:
        update.failureReason === undefined
          ? current.failure_reason
          : update.failureReason,
      lastEventId:
        update.lastEventId === undefined
          ? current.last_event_id
          : update.lastEventId,
      startedAt:
        update.startedAt === undefined ? current.started_at : update.startedAt,
      lastActivityAt:
        update.lastActivityAt === undefined
          ? current.last_activity_at
          : update.lastActivityAt,
      completedAt:
        update.completedAt === undefined ? current.completed_at : update.completedAt,
      updatedAt: new Date().toISOString(),
    });
}

function appendLocalEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    error?: AcpEventErrorPayload | null;
    eventId?: string;
    payload: Record<string, unknown>;
    sessionId: string;
    type: AcpEventTypePayload;
  },
): AcpEventEnvelopePayload {
  const emittedAt = new Date().toISOString();
  const event: AcpEventEnvelopePayload = {
    eventId: input.eventId ?? createEventId(),
    sessionId: input.sessionId,
    type: input.type,
    emittedAt,
    data: input.payload,
    error: input.error ?? null,
  };

  sqlite
    .prepare(
      `
        INSERT OR IGNORE INTO project_acp_session_events (
          event_id,
          session_id,
          type,
          payload_json,
          error_json,
          emitted_at,
          created_at
        )
        VALUES (
          @eventId,
          @sessionId,
          @type,
          @payloadJson,
          @errorJson,
          @emittedAt,
          @createdAt
        )
      `,
    )
    .run({
      eventId: event.eventId,
      sessionId: event.sessionId,
      type: event.type,
      payloadJson: JSON.stringify(event.data),
      errorJson: event.error ? JSON.stringify(event.error) : null,
      emittedAt: event.emittedAt,
      createdAt: emittedAt,
    });

  updateSessionRuntime(sqlite, input.sessionId, {
    lastActivityAt: emittedAt,
    lastEventId: event.eventId,
  });

  broker.publish(event);
  return event;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGatewayEvent(
  event: AgentGatewayEventEnvelope,
): NormalizedGatewayEvent {
  const payload = asRecord(event.data) ?? {};
  const protocol = asText(payload.protocol) ?? undefined;
  const rawPayload = asRecord(payload.payload);
  const toolPayload = rawPayload ?? payload;

  if (event.type === 'status') {
    return {
      type: 'status',
      payload: {
        ...payload,
        ...(protocol ? { protocol } : {}),
      },
      error: gatewayErrorToPayload(event.error),
    };
  }

  if (event.type === 'delta') {
    return {
      type: 'message',
      payload: {
        content: asText(payload.text) ?? asText(payload.content),
        ...(protocol ? { protocol } : {}),
        payload,
      },
      error: gatewayErrorToPayload(event.error),
    };
  }

  if (event.type === 'tool') {
    const toolType = asText(toolPayload.type);
    const toolName =
      asText(toolPayload.toolName) ??
      asText(toolPayload.name) ??
      asText(payload.toolName) ??
      asText(payload.name);
    const isResult = toolType === 'tool_result';

    return {
      type: isResult ? 'tool_result' : 'tool_call',
      payload: {
        toolName,
        ...(isResult
          ? {
              output:
                toolPayload.result ??
                toolPayload.output ??
                toolPayload.content ??
                payload.result ??
                payload.output ??
                payload.content,
            }
          : {
              input:
                toolPayload.arguments ??
                toolPayload.input ??
                payload.arguments ??
                payload.input,
            }),
        ...(protocol ? { protocol } : {}),
        payload: toolPayload,
      },
      error: gatewayErrorToPayload(event.error),
    };
  }

  if (event.type === 'complete') {
    return {
      type: 'complete',
      payload: {
        reason: asText(payload.reason),
        state: asText(payload.state),
        ...(protocol ? { protocol } : {}),
        payload,
      },
      error: gatewayErrorToPayload(event.error),
    };
  }

    return {
      type: 'error',
      payload: {
        message: event.error?.message ?? asText(payload.message),
        state: asText(payload.state),
        source: asText(payload.source) ?? 'agent-gateway',
        ...(protocol ? { protocol } : {}),
        payload,
      },
    error: gatewayErrorToPayload(event.error),
  };
}

function gatewayErrorToPayload(
  error: AgentGatewayEventError | null | undefined,
): AcpEventErrorPayload | null {
  if (!error) {
    return null;
  }

  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
  };
}

function resolveSessionState(
  event: AgentGatewayEventEnvelope,
  fallback: AcpSessionState,
): AcpSessionState {
  if (
    event.type === 'complete' &&
    typeof event.data?.reason === 'string' &&
    event.data.reason === 'cancelled'
  ) {
    return 'CANCELLED';
  }

  if (event.type === 'error') {
    return 'FAILED';
  }

  if (event.type === 'complete') {
    return 'COMPLETED';
  }

  if (event.type === 'status') {
    const raw = event.data?.state;
    if (
      raw === 'PENDING' ||
      raw === 'RUNNING' ||
      raw === 'COMPLETED' ||
      raw === 'FAILED' ||
      raw === 'CANCELLED'
    ) {
      return raw;
    }
  }

  if (event.type === 'delta' || event.type === 'tool') {
    return 'RUNNING';
  }

  return fallback;
}

async function ensureRuntimeSession(
  sqlite: Database,
  sessionId: string,
  agentGatewayClient: AgentGatewayClient,
): Promise<string> {
  const session = getSessionRow(sqlite, sessionId);

  if (session.runtime_session_id) {
    return session.runtime_session_id;
  }

  const created = await agentGatewayClient.createSession({
    provider: session.provider,
    metadata: {
      actorUserId: session.actor_id,
      localSessionId: session.id,
      mode: session.mode,
      projectId: session.project_id,
    },
  });

  updateSessionRuntime(sqlite, sessionId, {
    runtimeSessionId: created.session.sessionId,
    startedAt: created.session.createdAt ?? session.started_at ?? new Date().toISOString(),
    state: (created.session.state as AcpSessionState | undefined) ?? session.state,
  });

  return created.session.sessionId;
}

function shouldKeepPolling(state: string | undefined, eventsSeen: number): boolean {
  if (state === 'PENDING' || state === 'RUNNING') {
    return true;
  }

  return eventsSeen > 0;
}

function startGatewayPolling(input: {
  agentGatewayClient: AgentGatewayClient;
  broker: AcpStreamBroker;
  sessionId: string;
  sqlite: Database;
}) {
  if (activeGatewayPolls.has(input.sessionId)) {
    return;
  }

  const task = (async () => {
    while (true) {
      const current = getSessionRow(input.sqlite, input.sessionId);
      const runtimeSessionId = current.runtime_session_id;

      if (!runtimeSessionId) {
        return;
      }

      const sinceEventId = current.last_event_id;
      const page = await input.agentGatewayClient.listEvents(
        runtimeSessionId,
        undefined,
      );
      let eventsSeen = 0;

      for (const event of page.events) {
        const eventId = event.eventId ?? event.cursor ?? createEventId();
        const exists = input.sqlite
          .prepare(
            'SELECT 1 FROM project_acp_session_events WHERE event_id = ? LIMIT 1',
          )
          .get(eventId) as { 1: number } | undefined;
        if (exists) {
          continue;
        }

        eventsSeen++;
        const normalizedEvent = normalizeGatewayEvent(event);
        appendLocalEvent(input.sqlite, input.broker, {
          sessionId: input.sessionId,
          eventId,
          type: normalizedEvent.type,
          payload: normalizedEvent.payload,
          error: normalizedEvent.error,
        });

        const nextState = resolveSessionState(event, current.state);
        updateSessionRuntime(input.sqlite, input.sessionId, {
          state: nextState,
          failureReason:
            nextState === 'FAILED'
              ? (event.error?.message ?? current.failure_reason ?? 'Gateway execution failed')
              : null,
          completedAt:
            nextState === 'COMPLETED' || nextState === 'FAILED' || nextState === 'CANCELLED'
              ? event.emittedAt ?? new Date().toISOString()
              : null,
        });
      }

      const refreshed = getSessionRow(input.sqlite, input.sessionId);
      const stateFromPage = page.session.state as AcpSessionState | undefined;
      if (stateFromPage) {
        updateSessionRuntime(input.sqlite, input.sessionId, {
          state: stateFromPage,
          failureReason:
            stateFromPage === 'FAILED'
              ? refreshed.failure_reason ?? 'Gateway session failed'
              : stateFromPage === 'CANCELLED'
                ? refreshed.failure_reason
                : null,
          completedAt:
            stateFromPage === 'COMPLETED' ||
            stateFromPage === 'FAILED' ||
            stateFromPage === 'CANCELLED'
              ? refreshed.completed_at ?? new Date().toISOString()
              : null,
          lastActivityAt:
            refreshed.last_activity_at ?? new Date().toISOString(),
        });
      }

      if (
        !shouldKeepPolling(page.session.state, eventsSeen) &&
        sinceEventId === getSessionRow(input.sqlite, input.sessionId).last_event_id
      ) {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, gatewayPollIntervalMs);
      });
    }
  })()
    .catch((error: unknown) => {
      appendLocalEvent(input.sqlite, input.broker, {
        sessionId: input.sessionId,
        type: 'error',
        payload: {
          source: 'local-server',
          message: error instanceof Error ? error.message : 'ACP gateway poll failed',
          state: 'FAILED',
        },
        error: {
          code: 'ACP_GATEWAY_POLL_FAILED',
          message: error instanceof Error ? error.message : 'ACP gateway poll failed',
          retryable: true,
          retryAfterMs: 1000,
        },
      });
      updateSessionRuntime(input.sqlite, input.sessionId, {
        state: 'FAILED',
        failureReason: error instanceof Error ? error.message : 'ACP gateway poll failed',
        completedAt: new Date().toISOString(),
      });
    })
    .finally(() => {
      activeGatewayPolls.delete(input.sessionId);
    });

  activeGatewayPolls.set(input.sessionId, task);
}

export async function createAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  agentGatewayClient: AgentGatewayClient,
  input: CreateSessionInput,
): Promise<AcpSessionPayload> {
  await getProjectById(sqlite, input.projectId);
  if (input.parentSessionId) {
    getSessionRow(sqlite, input.parentSessionId);
  }

  const now = new Date().toISOString();
  const sessionId = createSessionId();
  sqlite
    .prepare(
      `
        INSERT INTO project_acp_sessions (
          id,
          project_id,
          actor_id,
          parent_session_id,
          name,
          provider,
          mode,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @actorId,
          @parentSessionId,
          @name,
          @provider,
          @mode,
          @state,
          NULL,
          NULL,
          NULL,
          @startedAt,
          @lastActivityAt,
          NULL,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run({
      id: sessionId,
      projectId: input.projectId,
      actorId: input.actorUserId,
      parentSessionId: input.parentSessionId ?? null,
      name: input.goal?.trim() || null,
      provider: input.provider,
      mode: input.mode,
      state: 'PENDING',
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

  const runtimeSessionId = await ensureRuntimeSession(sqlite, sessionId, agentGatewayClient);
  updateSessionRuntime(sqlite, sessionId, {
    runtimeSessionId,
    state: 'PENDING',
    startedAt: now,
    lastActivityAt: now,
  });

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'status',
    payload: {
      state: 'PENDING',
      reason: 'session_created',
      source: 'local-server',
      provider: input.provider,
    },
  });

  return await getAcpSessionById(sqlite, sessionId);
}

export async function listAcpSessionsByProject(
  sqlite: Database,
  projectId: string,
  query: ListSessionsQuery,
): Promise<AcpSessionListPayload> {
  await getProjectById(sqlite, projectId);
  const { page, pageSize } = query;
  const offset = (page - 1) * pageSize;

  const rows = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          actor_id,
          parent_session_id,
          name,
          provider,
          mode,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at
        FROM project_acp_sessions
        WHERE project_id = @projectId AND deleted_at IS NULL
        ORDER BY COALESCE(last_activity_at, started_at, completed_at) DESC, updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      projectId,
      limit: pageSize,
      offset,
    }) as AcpSessionRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_acp_sessions
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .get({ projectId }) as { count: number };

  return {
    items: rows.map(mapSessionRow),
    page,
    pageSize,
    projectId,
    total: total.count,
  };
}

export async function getAcpSessionById(
  sqlite: Database,
  sessionId: string,
): Promise<AcpSessionPayload> {
  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function listAcpSessionHistory(
  sqlite: Database,
  projectId: string,
  sessionId: string,
  limit: number,
  sinceEventId?: string,
): Promise<AcpEventEnvelopePayload[]> {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  const sinceSequence = sinceEventId
    ? ((sqlite
        .prepare(
          `
            SELECT sequence
            FROM project_acp_session_events
            WHERE event_id = ? AND session_id = ?
          `,
        )
        .get(sinceEventId, sessionId) as { sequence: number } | undefined)?.sequence ??
      0)
    : 0;

  const rows = sqlite
    .prepare(
      `
        SELECT
          event_id,
          session_id,
          type,
          payload_json,
          error_json,
          emitted_at
        FROM project_acp_session_events
        WHERE session_id = @sessionId AND sequence > @sinceSequence
        ORDER BY sequence ASC
        LIMIT @limit
      `,
    )
    .all({
      sessionId,
      sinceSequence,
      limit,
    }) as AcpEventRow[];

  return rows.map(mapEventRow);
}

export async function renameAcpSession(
  sqlite: Database,
  sessionId: string,
  name: string,
): Promise<AcpSessionPayload> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-session-name-invalid',
      title: 'ACP Session Name Invalid',
      status: 400,
      detail: 'ACP session name must not be blank',
    });
  }

  getSessionRow(sqlite, sessionId);
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET name = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(trimmedName, new Date().toISOString(), sessionId);

  return await getAcpSessionById(sqlite, sessionId);
}

export async function deleteAcpSession(
  sqlite: Database,
  sessionId: string,
): Promise<void> {
  getSessionRow(sqlite, sessionId);
  sqlite
    .prepare(
      `
        UPDATE project_acp_sessions
        SET deleted_at = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .run(new Date().toISOString(), new Date().toISOString(), sessionId);
}

export async function loadAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  agentGatewayClient: AgentGatewayClient,
  projectId: string,
  sessionId: string,
): Promise<AcpSessionPayload> {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (session.runtime_session_id && (session.state === 'PENDING' || session.state === 'RUNNING')) {
    startGatewayPolling({
      sqlite,
      broker,
      agentGatewayClient,
      sessionId,
    });
  }

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function promptAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  agentGatewayClient: AgentGatewayClient,
  projectId: string,
  sessionId: string,
  input: PromptSessionInput,
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }
  const project = await getProjectById(sqlite, projectId);
  const localMcpServer = resolveLocalMcpServer();
  const gatewayEnv: Record<string, string> = {};

  if (process.env.DESKTOP_SESSION_TOKEN?.trim()) {
    gatewayEnv.TEAMAI_DESKTOP_SESSION_TOKEN =
      process.env.DESKTOP_SESSION_TOKEN.trim();
  }

  const runtimeSessionId = await ensureRuntimeSession(sqlite, sessionId, agentGatewayClient);

  appendLocalEvent(sqlite, broker, {
    sessionId,
    eventId: input.eventId,
    type: 'status',
    payload: {
      prompt: input.prompt,
      reason: 'prompt_requested',
      source: 'local-server',
      state: 'RUNNING',
    },
  });
  updateSessionRuntime(sqlite, sessionId, {
    state: 'RUNNING',
    failureReason: null,
    completedAt: null,
    lastActivityAt: new Date().toISOString(),
  });

  const response = await agentGatewayClient.prompt(runtimeSessionId, {
    ...(project.workspaceRoot ? { cwd: project.workspaceRoot } : {}),
    ...(Object.keys(gatewayEnv).length > 0 ? { env: gatewayEnv } : {}),
    input: input.prompt,
    timeoutMs: input.timeoutMs,
    traceId: input.traceId,
    metadata: {
      localSessionId: sessionId,
      projectId,
      ...(localMcpServer ? { mcpServers: [localMcpServer] } : {}),
    },
  });

  if (response.session.state) {
    updateSessionRuntime(sqlite, sessionId, {
      state: response.session.state as AcpSessionState,
    });
  }

  startGatewayPolling({
    sqlite,
    broker,
    agentGatewayClient,
    sessionId,
  });

  return {
    session: await getAcpSessionById(sqlite, sessionId),
    runtime: response.runtime,
  };
}

export async function cancelAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  agentGatewayClient: AgentGatewayClient,
  projectId: string,
  sessionId: string,
  reason?: string,
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (!session.runtime_session_id) {
    updateSessionRuntime(sqlite, sessionId, {
      state: 'CANCELLED',
      completedAt: new Date().toISOString(),
      failureReason: reason ?? null,
    });
    appendLocalEvent(sqlite, broker, {
      sessionId,
      type: 'complete',
      payload: {
        reason: reason ?? 'cancel-requested',
        state: 'CANCELLED',
      },
    });
    return await getAcpSessionById(sqlite, sessionId);
  }

  await agentGatewayClient.cancel(session.runtime_session_id, {
    reason,
  });

  startGatewayPolling({
    sqlite,
    broker,
    agentGatewayClient,
    sessionId,
  });

  return await getAcpSessionById(sqlite, sessionId);
}
