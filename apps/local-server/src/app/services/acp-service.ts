import type { Database } from 'better-sqlite3';
import { isAbsolute } from 'node:path';
import { customAlphabet } from 'nanoid';
import type {
  ContentBlock,
  McpServer,
  PromptResponse,
  SessionNotification,
  SessionUpdate,
} from '@agentclientprotocol/sdk';
import type {
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
} from '../clients/acp-runtime-client';
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
import { createAgent } from './agent-service';
import { getProjectById } from './project-service';
import { getSpecialistById } from './specialist-service';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  16,
);

interface AcpSessionRow {
  agent_id: string | null;
  actor_id: string;
  completed_at: string | null;
  cwd: string | null;
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
  specialist_id: string | null;
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
  specialistId?: string;
}

interface PromptSessionInput {
  eventId?: string;
  prompt: string;
  timeoutMs?: number;
  traceId?: string;
}

type NormalizedAcpUpdateEvent = {
  type: AcpEventTypePayload;
  payload: Record<string, unknown>;
};

function createSessionId() {
  return `acps_${sessionIdGenerator()}`;
}

function createEventId() {
  return `acpe_${eventIdGenerator()}`;
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
    agent: row.agent_id ? { id: row.agent_id } : null,
    actor: { id: row.actor_id },
    parentSession: row.parent_session_id ? { id: row.parent_session_id } : null,
    name: row.name,
    provider: row.provider,
    specialistId: row.specialist_id,
    mode: row.mode,
    cwd: row.cwd ?? '',
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
          agent_id,
          actor_id,
          parent_session_id,
          name,
          provider,
          mode,
          cwd,
          state,
          runtime_session_id,
          specialist_id,
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
    name?: string | null;
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
          name = @name,
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
      name: update.name === undefined ? current.name : update.name,
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

function getSessionAgentPrompt(
  sqlite: Database,
  session: Pick<AcpSessionRow, 'agent_id' | 'project_id'>,
): string | null {
  if (!session.agent_id) {
    return null;
  }

  const row = sqlite
    .prepare(
      `
        SELECT system_prompt
        FROM project_agents
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `,
    )
    .get(session.agent_id, session.project_id) as
    | { system_prompt: string | null }
    | undefined;

  return row?.system_prompt?.trim() || null;
}

function sessionHasPromptHistory(sqlite: Database, sessionId: string): boolean {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_acp_session_events
        WHERE session_id = ? AND type = 'message'
      `,
    )
    .get(sessionId) as { count: number };

  return row.count > 0;
}

function buildBootstrapPrompt(systemPrompt: string, userPrompt: string): string {
  return [`System:\n${systemPrompt.trim()}`, `User:\n${userPrompt}`].join('\n\n');
}

function resolveSessionCwd(repoPath: string | null): string {
  const cwd = repoPath?.trim();
  if (!cwd || !isAbsolute(cwd)) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-project-workspace-missing',
      title: 'ACP Project Workspace Missing',
      status: 409,
      detail:
        'ACP sessions require project.repoPath to be set to an absolute local path',
    });
  }

  return cwd;
}

function resolveLocalMcpServers(): McpServer[] {
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const port = process.env.PORT?.trim();

  if (!port) {
    return [];
  }

  const headers =
    process.env.DESKTOP_SESSION_TOKEN?.trim()
      ? [
          {
            name: 'Authorization',
            value: `Bearer ${process.env.DESKTOP_SESSION_TOKEN.trim()}`,
          },
        ]
      : [];

  return [
    {
      type: 'http',
      name: 'team_ai_local',
      url: `http://${host}:${port}/api/mcp`,
      headers,
    },
  ];
}

function createRuntimeHooks(
  sqlite: Database,
  broker: AcpStreamBroker,
  localSessionId: string,
): AcpRuntimeSessionHooks {
  return {
    async onSessionUpdate(notification) {
      const normalized = normalizeAcpNotification(notification);
      const emitted = appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        type: normalized.type,
        payload: normalized.payload,
      });

      const current = getSessionRow(sqlite, localSessionId);
      const state = resolveSessionStateFromUpdate(notification.update, current.state);
      updateSessionRuntime(sqlite, localSessionId, {
        state,
        lastActivityAt:
          extractUpdatedAt(notification.update) ?? emitted.emittedAt,
        name: extractSessionTitle(notification.update) ?? current.name,
        completedAt:
          state === 'COMPLETED' || state === 'CANCELLED' || state === 'FAILED'
            ? emitted.emittedAt
            : null,
        failureReason: state === 'FAILED' ? current.failure_reason : null,
      });
    },
    async onClosed(error) {
      const current = getSessionRow(sqlite, localSessionId);
      if (!error) {
        return;
      }

      if (current.state === 'CANCELLED' || current.state === 'COMPLETED') {
        return;
      }

      appendLocalEvent(sqlite, broker, {
        sessionId: localSessionId,
        type: 'error',
        payload: {
          source: 'acp-sdk',
          message: error.message,
        },
        error: {
          code: 'ACP_CONNECTION_CLOSED',
          message: error.message,
          retryable: true,
          retryAfterMs: 1000,
        },
      });

      updateSessionRuntime(sqlite, localSessionId, {
        state: 'FAILED',
        failureReason: error.message,
        completedAt: new Date().toISOString(),
      });
    },
  };
}

function normalizeAcpNotification(
  notification: SessionNotification,
): NormalizedAcpUpdateEvent {
  const update = notification.update;
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
    case 'agent_message_chunk':
    case 'agent_thought_chunk':
      return {
        type: 'message',
        payload: {
          source: 'acp-sdk',
          kind: update.sessionUpdate,
          role: resolveMessageRole(update.sessionUpdate),
          messageId: update.messageId ?? null,
          content: flattenContentBlock(update.content),
          contentBlock: update.content,
        },
      };
    case 'tool_call':
      return {
        type: 'tool_call',
        payload: {
          source: 'acp-sdk',
          toolCallId: update.toolCallId,
          title: update.title,
          status: update.status ?? null,
          kind: update.kind ?? null,
          rawInput: update.rawInput ?? null,
          rawOutput: update.rawOutput ?? null,
          locations: update.locations ?? [],
          content: update.content ?? [],
        },
      };
    case 'tool_call_update':
      return {
        type: update.status === 'completed' ? 'tool_result' : 'tool_call',
        payload: {
          source: 'acp-sdk',
          toolCallId: update.toolCallId,
          title: update.title ?? null,
          status: update.status ?? null,
          kind: update.kind ?? null,
          rawInput: update.rawInput ?? null,
          rawOutput: update.rawOutput ?? null,
          locations: update.locations ?? [],
          content: update.content ?? [],
        },
      };
    case 'plan':
      return {
        type: 'plan',
        payload: {
          source: 'acp-sdk',
          entries: update.entries,
        },
      };
    case 'session_info_update':
      return {
        type: 'session',
        payload: {
          source: 'acp-sdk',
          title: update.title ?? null,
          updatedAt: update.updatedAt ?? null,
        },
      };
    case 'current_mode_update':
      return {
        type: 'mode',
        payload: {
          source: 'acp-sdk',
          currentModeId: update.currentModeId,
        },
      };
    case 'config_option_update':
      return {
        type: 'config',
        payload: {
          source: 'acp-sdk',
          configOptions: update.configOptions,
        },
      };
    case 'usage_update':
      return {
        type: 'usage',
        payload: {
          source: 'acp-sdk',
          size: update.size,
          used: update.used,
          cost: update.cost ?? null,
        },
      };
    case 'available_commands_update':
      return {
        type: 'status',
        payload: {
          source: 'acp-sdk',
          availableCommands: update.availableCommands,
        },
      };
  }
}

function resolveMessageRole(
  updateType:
    | 'user_message_chunk'
    | 'agent_message_chunk'
    | 'agent_thought_chunk',
): 'user' | 'assistant' | 'thought' {
  if (updateType === 'user_message_chunk') {
    return 'user';
  }

  if (updateType === 'agent_thought_chunk') {
    return 'thought';
  }

  return 'assistant';
}

function flattenContentBlock(content: ContentBlock): string | null {
  if (content.type === 'text') {
    return content.text;
  }

  if (content.type === 'resource_link') {
    return content.uri;
  }

  if (content.type === 'resource') {
    const resource = content.resource;
    if ('text' in resource) {
      return resource.text;
    }
  }

  return null;
}

function resolveSessionStateFromUpdate(
  update: SessionUpdate,
  fallback: AcpSessionState,
): AcpSessionState {
  if (update.sessionUpdate === 'agent_message_chunk') {
    return 'RUNNING';
  }

  if (update.sessionUpdate === 'agent_thought_chunk') {
    return 'RUNNING';
  }

  if (update.sessionUpdate === 'tool_call') {
    return 'RUNNING';
  }

  if (update.sessionUpdate === 'tool_call_update') {
    if (update.status === 'failed') {
      return 'FAILED';
    }
    return 'RUNNING';
  }

  return fallback;
}

function extractSessionTitle(update: SessionUpdate): string | null {
  if (update.sessionUpdate === 'session_info_update') {
    return update.title ?? null;
  }

  return null;
}

function extractUpdatedAt(update: SessionUpdate): string | null {
  if (update.sessionUpdate === 'session_info_update') {
    return update.updatedAt ?? null;
  }

  return null;
}

function appendPromptRequestedEvents(
  sqlite: Database,
  broker: AcpStreamBroker,
  sessionId: string,
  prompt: string,
  eventId?: string,
) {
  appendLocalEvent(sqlite, broker, {
    sessionId,
    eventId,
    type: 'message',
    payload: {
      source: 'local-server',
      role: 'user',
      content: prompt,
    },
  });

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'status',
    payload: {
      source: 'local-server',
      state: 'RUNNING',
      reason: 'prompt_requested',
    },
  });
}

function updateSessionFromPromptResponse(
  sqlite: Database,
  broker: AcpStreamBroker,
  sessionId: string,
  response: PromptResponse,
) {
  let state: AcpSessionState = 'COMPLETED';
  if (response.stopReason === 'cancelled') {
    state = 'CANCELLED';
  }

  const completedAt = new Date().toISOString();
  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'complete',
    payload: {
      source: 'acp-sdk',
      stopReason: response.stopReason,
      userMessageId: response.userMessageId ?? null,
      usage: response.usage ?? null,
      state,
    },
  });

  updateSessionRuntime(sqlite, sessionId, {
    state,
    failureReason: null,
    completedAt,
    lastActivityAt: completedAt,
  });
}

async function ensureRuntimeLoaded(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  sessionId: string,
): Promise<string> {
  const session = getSessionRow(sqlite, sessionId);
  if (runtime.isSessionActive(sessionId) && session.runtime_session_id) {
    return session.runtime_session_id;
  }

  if (!session.runtime_session_id) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-runtime-missing',
      title: 'ACP Runtime Missing',
      status: 409,
      detail: `ACP session ${sessionId} does not have a runtime session id`,
    });
  }

  await runtime.loadSession({
    localSessionId: session.id,
    runtimeSessionId: session.runtime_session_id,
    provider: session.provider,
    cwd: session.cwd ?? '',
    mode: session.mode,
    mcpServers: resolveLocalMcpServers(),
    hooks: createRuntimeHooks(sqlite, broker, session.id),
  });

  return session.runtime_session_id;
}

export async function createAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  input: CreateSessionInput,
): Promise<AcpSessionPayload> {
  const project = await getProjectById(sqlite, input.projectId);
  const parentSession = input.parentSessionId
    ? getSessionRow(sqlite, input.parentSessionId)
    : null;
  const specialist = input.specialistId
    ? await getSpecialistById(sqlite, input.projectId, input.specialistId)
    : null;

  const cwd = resolveSessionCwd(project.repoPath ?? null);
  const now = new Date().toISOString();
  const sessionId = createSessionId();
  const agent = specialist
    ? await createAgent(sqlite, {
        projectId: input.projectId,
        name: specialist.name,
        role: specialist.role,
        provider: input.provider,
        model: specialist.modelTier ?? 'default',
        systemPrompt: specialist.systemPrompt,
        specialistId: specialist.id,
        parentAgentId: parentSession?.agent_id ?? null,
      })
    : null;

  sqlite
    .prepare(
      `
        INSERT INTO project_acp_sessions (
          id,
          project_id,
          agent_id,
          actor_id,
          parent_session_id,
          specialist_id,
          name,
          provider,
          mode,
          cwd,
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
          @agentId,
          @actorId,
          @parentSessionId,
          @specialistId,
          @name,
          @provider,
          @mode,
          @cwd,
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
      agentId: agent?.id ?? null,
      actorId: input.actorUserId,
      parentSessionId: input.parentSessionId ?? null,
      specialistId: specialist?.id ?? null,
      name: input.goal?.trim() || null,
      provider: input.provider,
      mode: input.mode,
      cwd,
      state: 'PENDING',
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

  const runtimeSession = await runtime.createSession({
    localSessionId: sessionId,
    provider: input.provider,
    cwd,
    mode: input.mode,
    mcpServers: resolveLocalMcpServers(),
    hooks: createRuntimeHooks(sqlite, broker, sessionId),
  });

  updateSessionRuntime(sqlite, sessionId, {
    runtimeSessionId: runtimeSession.runtimeSessionId,
    state: 'PENDING',
    startedAt: now,
    lastActivityAt: now,
  });

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'session',
    payload: {
      source: 'local-server',
      provider: input.provider,
      mode: input.mode,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      agentRole: agent?.role ?? null,
      specialistId: specialist?.id ?? null,
      cwd,
      state: 'PENDING',
      reason: 'session_created',
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
          agent_id,
          actor_id,
          parent_session_id,
          specialist_id,
          name,
          provider,
          mode,
          cwd,
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
  runtime: AcpRuntimeClient,
  sessionId: string,
): Promise<void> {
  getSessionRow(sqlite, sessionId);
  await runtime.deleteSession(sessionId);
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
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
): Promise<AcpSessionPayload> {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (session.runtime_session_id && !runtime.isSessionActive(sessionId)) {
    await runtime.loadSession({
      localSessionId: session.id,
      runtimeSessionId: session.runtime_session_id,
      provider: session.provider,
      cwd: session.cwd ?? '',
      mode: session.mode,
      mcpServers: resolveLocalMcpServers(),
      hooks: createRuntimeHooks(sqlite, broker, session.id),
    });
  }

  return mapSessionRow(getSessionRow(sqlite, sessionId));
}

export async function promptAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  input: PromptSessionInput,
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  const bootstrapPrompt = sessionHasPromptHistory(sqlite, sessionId)
    ? null
    : getSessionAgentPrompt(sqlite, session);
  const effectivePrompt = bootstrapPrompt
    ? buildBootstrapPrompt(bootstrapPrompt, input.prompt)
    : input.prompt;

  await ensureRuntimeLoaded(sqlite, broker, runtime, sessionId);
  appendPromptRequestedEvents(
    sqlite,
    broker,
    sessionId,
    input.prompt,
    input.eventId,
  );
  updateSessionRuntime(sqlite, sessionId, {
    state: 'RUNNING',
    failureReason: null,
    completedAt: null,
    lastActivityAt: new Date().toISOString(),
  });

  try {
    const runtimeResult = await runtime.promptSession({
      localSessionId: sessionId,
      prompt: effectivePrompt,
      eventId: input.eventId,
      timeoutMs: input.timeoutMs,
      traceId: input.traceId,
    });

    updateSessionFromPromptResponse(
      sqlite,
      broker,
      sessionId,
      runtimeResult.response,
    );

    return {
      session: await getAcpSessionById(sqlite, sessionId),
      runtime: {
        provider: session.provider,
        sessionId: runtimeResult.runtimeSessionId,
        stopReason: runtimeResult.response.stopReason,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'ACP prompt execution failed';
    appendLocalEvent(sqlite, broker, {
      sessionId,
      type: 'error',
      payload: {
        source: 'acp-sdk',
        message,
      },
      error: {
        code: 'ACP_PROMPT_FAILED',
        message,
        retryable: true,
        retryAfterMs: 1000,
      },
    });
    updateSessionRuntime(sqlite, sessionId, {
      state: 'FAILED',
      failureReason: message,
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function cancelAcpSession(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  projectId: string,
  sessionId: string,
  reason?: string,
) {
  const session = getSessionRow(sqlite, sessionId);
  if (session.project_id !== projectId) {
    throwSessionNotFound(sessionId);
  }

  if (session.runtime_session_id && !runtime.isSessionActive(sessionId)) {
    await ensureRuntimeLoaded(sqlite, broker, runtime, sessionId);
  }

  if (session.runtime_session_id && runtime.isSessionActive(sessionId)) {
    await runtime.cancelSession({
      localSessionId: sessionId,
      reason,
    });
  }

  appendLocalEvent(sqlite, broker, {
    sessionId,
    type: 'complete',
    payload: {
      source: 'local-server',
      reason: reason ?? 'cancel-requested',
      state: 'CANCELLED',
    },
  });
  updateSessionRuntime(sqlite, sessionId, {
    state: 'CANCELLED',
    completedAt: new Date().toISOString(),
    failureReason: reason ?? null,
  });

  return await getAcpSessionById(sqlite, sessionId);
}
