import type { Database } from 'better-sqlite3';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
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
import { getDrizzleDb } from '../db/drizzle';
import {
  projectAcpSessionEventsTable,
  projectAcpSessionsTable,
} from '../db/schema';
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
  acpEventRowSelection,
  acpSessionRowSelection,
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

  const row = getDrizzleDb(sqlite)
    .select({
      present: sql<number>`1`,
    })
    .from(projectAcpSessionEventsTable)
    .where(eq(projectAcpSessionEventsTable.eventId, eventId))
    .limit(1)
    .get() as { present: number } | undefined;

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

  const rows = getDrizzleDb(sqlite)
    .select(acpSessionRowSelection)
    .from(projectAcpSessionsTable)
    .where(
      and(
        eq(projectAcpSessionsTable.projectId, projectId),
        isNull(projectAcpSessionsTable.deletedAt),
      ),
    )
    .orderBy(
      desc(
        sql`coalesce(${projectAcpSessionsTable.lastActivityAt}, ${projectAcpSessionsTable.startedAt}, ${projectAcpSessionsTable.completedAt})`,
      ),
      desc(projectAcpSessionsTable.updatedAt),
    )
    .limit(pageSize)
    .offset(offset)
    .all() as AcpSessionRow[];

  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectAcpSessionsTable)
    .where(
      and(
        eq(projectAcpSessionsTable.projectId, projectId),
        isNull(projectAcpSessionsTable.deletedAt),
      ),
    )
    .get() as { count: number };

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
    ? ((getDrizzleDb(sqlite)
        .select({
          sequence: projectAcpSessionEventsTable.sequence,
        })
        .from(projectAcpSessionEventsTable)
        .where(
          and(
            eq(projectAcpSessionEventsTable.eventId, sinceEventId),
            eq(projectAcpSessionEventsTable.sessionId, sessionId),
          ),
        )
        .get() as { sequence: number } | undefined)?.sequence ?? 0)
    : 0;

  const rows = getDrizzleDb(sqlite)
    .select(acpEventRowSelection)
    .from(projectAcpSessionEventsTable)
    .where(
      and(
        eq(projectAcpSessionEventsTable.sessionId, sessionId),
        gt(projectAcpSessionEventsTable.sequence, sinceSequence),
      ),
    )
    .orderBy(asc(projectAcpSessionEventsTable.sequence))
    .limit(limit)
    .all() as AcpEventRow[];

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
