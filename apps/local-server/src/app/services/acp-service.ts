import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  AcpRuntimeClient,
  AcpStreamBroker,
  AcpEventEnvelopePayload,
  AcpOrchestrationEventName,
  AcpRuntimeSessionListPayload,
  AcpSessionListPayload,
  AcpSessionPayload,
} from '@orchestration/runtime-acp';
import {
  appendLocalEvent,
  createCanonicalUpdate,
} from './acp-session-events';
import {
  flushAcpSessionEventWriteBuffer,
  getAcpSessionEventWriteBuffer,
} from './acp-session-event-write-buffer';
import {
  DEFAULT_ACP_PROMPT_TIMEOUT_MS,
  DEFAULT_ACP_SESSION_SUPERVISION_POLICY,
  getSessionRow,
  mapEventRow,
  mapRuntimeSessionSnapshot,
  mapSessionRow,
  type AcpEventRow,
  type AcpSessionRow,
} from './acp-session-store';
import {
  ensureRuntimeLoaded,
  type AcpServiceOptions,
  cancelAcpSession,
  createAcpSession,
  deleteAcpSession,
  loadAcpSession,
  promptAcpSession,
  renameAcpSession,
  updateAcpSession,
  type CreateSessionInput,
  type PromptSessionInput,
} from './acp-session-runtime';
import {
  runAcpSessionSupervisionTick as runAcpSessionSupervisionTickInternal,
} from './acp-session-supervision';
import { syncTaskExecutionOutcome } from './acp-session-task-sync';
import { getProjectById } from './project-service';

export {
  DEFAULT_ACP_PROMPT_TIMEOUT_MS,
  DEFAULT_ACP_SESSION_SUPERVISION_POLICY,
  cancelAcpSession,
  createAcpSession,
  deleteAcpSession,
  ensureRuntimeLoaded,
  loadAcpSession,
  promptAcpSession,
  renameAcpSession,
  updateAcpSession,
};
export type {
  AcpServiceOptions,
  CreateSessionInput,
  PromptSessionInput,
};

interface ListSessionsQuery {
  page: number;
  pageSize: number;
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-not-found',
    title: 'ACP Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
  });
}

export async function runAcpSessionSupervisionTick(
  sqlite: Database,
  broker: AcpStreamBroker,
  runtime: AcpRuntimeClient,
  options: AcpServiceOptions & {
    now?: Date;
  } = {},
): Promise<{
  checkedSessionIds: string[];
  forcedSessionIds: string[];
  timedOutSessionIds: string[];
}> {
  return await runAcpSessionSupervisionTickInternal(
    sqlite,
    broker,
    runtime,
    {
      ensureRuntimeLoaded,
      syncTaskExecutionOutcome,
    },
    options,
  );
}

export function hasAcpSessionEvent(sqlite: Database, eventId: string) {
  if (getAcpSessionEventWriteBuffer(sqlite).hasEvent(eventId)) {
    return true;
  }

  const row = sqlite
    .prepare(
      `
        SELECT 1 AS present
        FROM project_acp_session_events
        WHERE event_id = ?
        LIMIT 1
      `,
    )
    .get(eventId) as { present: number } | undefined;

  return row?.present === 1;
}

export function recordAcpOrchestrationEvent(
  sqlite: Database,
  broker: AcpStreamBroker,
  input: {
    childSessionId?: string | null;
    delegationGroupId?: string | null;
    eventId?: string;
    eventName: AcpOrchestrationEventName;
    parentSessionId?: string | null;
    sessionId: string;
    taskId?: string | null;
    taskIds?: string[];
    wakeDelivered?: boolean;
  },
) {
  const session = getSessionRow(sqlite, input.sessionId);

  return appendLocalEvent(sqlite, broker, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    update: createCanonicalUpdate(
      input.sessionId,
      session.provider,
      'orchestration_update',
      {
        orchestration: {
          childSessionId: input.childSessionId ?? null,
          delegationGroupId: input.delegationGroupId ?? null,
          eventName: input.eventName,
          parentSessionId: input.parentSessionId ?? null,
          taskId: input.taskId ?? null,
          taskIds: input.taskIds ?? [],
          wakeDelivered: input.wakeDelivered,
        },
      },
    ),
  });
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
          supervision_policy_json,
          deadline_at,
          inactive_deadline_at,
          cancel_requested_at,
          cancelled_at,
          force_killed_at,
          timeout_scope,
          step_count,
          codebase_id,
          parent_session_id,
          specialist_id,
          name,
          model,
          provider,
          cwd,
          acp_status,
          acp_error,
          state,
          runtime_session_id,
          failure_reason,
          last_event_id,
          started_at,
          last_activity_at,
          completed_at,
          task_id,
          worktree_id
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

  await flushAcpSessionEventWriteBuffer(sqlite, sessionId);

  const sinceSequence = sinceEventId
    ? ((
        sqlite
          .prepare(
            `
            SELECT sequence
            FROM project_acp_session_events
            WHERE event_id = ? AND session_id = ?
          `,
          )
          .get(sinceEventId, sessionId) as { sequence: number } | undefined
      )?.sequence ?? 0)
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

export async function listAcpRuntimeSessions(
  sqlite: Database,
  runtime: AcpRuntimeClient,
  streamSubscribers: (sessionId: string) => number,
): Promise<AcpRuntimeSessionListPayload> {
  const runtimeSessions = runtime.listSessions?.() ?? [];
  const items = runtimeSessions
    .map((runtimeSession) =>
      mapRuntimeSessionSnapshot(sqlite, runtimeSession, streamSubscribers),
    )
    .sort(
      (left, right) =>
        Date.parse(right.lastTouchedAt) - Date.parse(left.lastTouchedAt),
    );

  return {
    items,
    total: items.length,
  };
}
