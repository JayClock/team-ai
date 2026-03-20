import type { Database } from 'better-sqlite3';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import {
  projectAcpSessionsTable,
  projectTracesTable,
} from '../db/schema';
import type {
  ListTracesInput,
  RecordAcpTraceInput,
  TraceListPayload,
  TracePayload,
  TraceStatsPayload,
} from '../schemas/trace';
import { collectTaskTraceSessionIds } from './kanban-card-memory-service';
import { getProjectById } from './project-service';
import { getTaskById } from './task-service';

interface SessionTraceContextRow {
  model: string | null;
  project_id: string;
}

interface SupervisionSessionStatsRow {
  cancel_requested_at: string | null;
  completed_at: string | null;
  force_killed_at: string | null;
  model: string | null;
  provider: string;
  task_id: string | null;
  timeout_scope: string | null;
}

interface TraceRow {
  created_at: string;
  event_id: string;
  event_type: string;
  id: string;
  model: string | null;
  payload_json: string;
  project_id: string;
  provider: string;
  session_id: string;
  source_trace_id: string | null;
  summary: string;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapTraceRow(row: TraceRow): TracePayload {
  return {
    createdAt: row.created_at,
    eventId: row.event_id,
    eventType: row.event_type as TracePayload['eventType'],
    id: row.id,
    model: row.model,
    payload: parsePayload(row.payload_json),
    projectId: row.project_id,
    provider: row.provider,
    sessionId: row.session_id,
    sourceTraceId: row.source_trace_id,
    summary: row.summary,
  };
}

function summarizeTrace(input: RecordAcpTraceInput['update']) {
  switch (input.eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'user_message': {
      const role = input.message?.role ?? input.eventType;
      const content = input.message?.content?.trim();
      return content ? `${role}: ${content.slice(0, 120)}` : role;
    }
    case 'tool_call':
    case 'tool_call_update': {
      const title = input.toolCall?.title?.trim() || input.toolCall?.toolCallId;
      const status = input.toolCall?.status ?? 'unknown';
      return title
        ? `${input.eventType}: ${title} (${status})`
        : `${input.eventType} (${status})`;
    }
    case 'terminal_created':
    case 'terminal_output':
    case 'terminal_exited':
      return input.terminal?.command?.trim()
        ? `${input.eventType}: ${input.terminal.command}`
        : `${input.eventType}: ${input.terminal?.terminalId ?? 'terminal'}`;
    case 'turn_complete':
      return `turn_complete: ${input.turnComplete?.stopReason ?? 'completed'}`;
    case 'orchestration_update':
      return `orchestration_update: ${input.orchestration?.eventName ?? 'update'}`;
    case 'lifecycle_update':
      return `lifecycle_update: ${input.lifecycle?.state ?? 'update'}`;
    case 'supervision_update':
      return (
        `supervision_update: ${input.supervision?.stage ?? 'update'}` +
        (input.supervision?.scope ? ` (${input.supervision.scope})` : '')
      );
    case 'session_info_update':
      return 'session_info_update';
    case 'plan_update':
      return 'plan_update';
    case 'usage_update':
      return 'usage_update';
    case 'available_commands_update':
      return 'available_commands_update';
    case 'config_option_update':
      return 'config_option_update';
    case 'current_mode_update':
      return 'current_mode_update';
    case 'error':
      return 'error';
    default:
      return input.eventType;
  }
}

function combineFilters(filters: SQL<unknown>[]) {
  if (filters.length === 0) {
    return undefined;
  }

  return filters.length === 1 ? filters[0] : and(...filters);
}

function buildTraceFilters(input: {
  eventType?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  taskSessionIds?: string[];
}) {
  const filters: SQL<unknown>[] = [];

  if (input.projectId) {
    filters.push(eq(projectTracesTable.projectId, input.projectId));
  }

  if (input.sessionId) {
    filters.push(eq(projectTracesTable.sessionId, input.sessionId));
  }

  if (input.eventType) {
    filters.push(eq(projectTracesTable.eventType, input.eventType));
  }

  if (input.taskSessionIds && input.taskSessionIds.length > 0) {
    filters.push(inArray(projectTracesTable.sessionId, input.taskSessionIds));
  }

  return combineFilters(filters);
}

function getTraceContext(sqlite: Database, sessionId: string) {
  return getDrizzleDb(sqlite)
    .select({
      model: projectAcpSessionsTable.model,
      project_id: projectAcpSessionsTable.projectId,
    })
    .from(projectAcpSessionsTable)
    .where(
      and(
        eq(projectAcpSessionsTable.id, sessionId),
        isNull(projectAcpSessionsTable.deletedAt),
      ),
    )
    .get() as SessionTraceContextRow | undefined;
}

function throwTraceNotFound(traceId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/trace-not-found',
    title: 'Trace Not Found',
    status: 404,
    detail: `Trace ${traceId} was not found`,
  });
}

export function recordAcpTrace(
  sqlite: Database,
  input: RecordAcpTraceInput,
): TracePayload | null {
  const context = getTraceContext(sqlite, input.sessionId);
  if (!context) {
    return null;
  }

  getDrizzleDb(sqlite)
    .insert(projectTracesTable)
    .values({
      createdAt: input.createdAt,
      eventId: input.eventId,
      eventType: input.update.eventType,
      id: input.eventId,
      model: context.model,
      payloadJson: JSON.stringify(input.update),
      projectId: context.project_id,
      provider: input.update.provider,
      sessionId: input.sessionId,
      sourceTraceId: input.update.traceId ?? null,
      summary: summarizeTrace(input.update),
    })
    .onConflictDoNothing({
      target: projectTracesTable.id,
    })
    .run();

  return getTraceById(sqlite, input.eventId);
}

export async function listTraces(
  sqlite: Database,
  input: ListTracesInput = {},
): Promise<TraceListPayload> {
  if (input.projectId) {
    await getProjectById(sqlite, input.projectId);
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const taskSessionIds =
    input.taskId !== undefined
      ? collectTaskTraceSessionIds(await getTaskById(sqlite, input.taskId))
      : [];

  if (input.taskId) {
    if (taskSessionIds.length === 0) {
      return {
        eventType: input.eventType ?? null,
        items: [],
        limit,
        offset,
        projectId: input.projectId ?? null,
        sessionId: input.sessionId ?? null,
        taskId: input.taskId,
        total: 0,
      };
    }
  }

  const filters = buildTraceFilters({
    eventType: input.eventType,
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskSessionIds,
  });
  const rows = getDrizzleDb(sqlite)
    .select({
      created_at: projectTracesTable.createdAt,
      event_id: projectTracesTable.eventId,
      event_type: projectTracesTable.eventType,
      id: projectTracesTable.id,
      model: projectTracesTable.model,
      payload_json: projectTracesTable.payloadJson,
      project_id: projectTracesTable.projectId,
      provider: projectTracesTable.provider,
      session_id: projectTracesTable.sessionId,
      source_trace_id: projectTracesTable.sourceTraceId,
      summary: projectTracesTable.summary,
    })
    .from(projectTracesTable)
    .where(filters)
    .orderBy(desc(projectTracesTable.createdAt))
    .limit(limit)
    .offset(offset)
    .all() as TraceRow[];

  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectTracesTable)
    .where(filters)
    .get() as { count: number };

  return {
    eventType: input.eventType ?? null,
    items: rows.map(mapTraceRow),
    limit,
    offset,
    projectId: input.projectId ?? null,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    total: total.count,
  };
}

export function getTraceById(sqlite: Database, traceId: string): TracePayload {
  const row = getDrizzleDb(sqlite)
    .select({
      created_at: projectTracesTable.createdAt,
      event_id: projectTracesTable.eventId,
      event_type: projectTracesTable.eventType,
      id: projectTracesTable.id,
      model: projectTracesTable.model,
      payload_json: projectTracesTable.payloadJson,
      project_id: projectTracesTable.projectId,
      provider: projectTracesTable.provider,
      session_id: projectTracesTable.sessionId,
      source_trace_id: projectTracesTable.sourceTraceId,
      summary: projectTracesTable.summary,
    })
    .from(projectTracesTable)
    .where(eq(projectTracesTable.id, traceId))
    .get() as TraceRow | undefined;

  if (!row) {
    throwTraceNotFound(traceId);
  }

  return mapTraceRow(row);
}

export async function getTraceStats(
  sqlite: Database,
  input: Pick<ListTracesInput, 'projectId' | 'sessionId' | 'taskId'> = {},
): Promise<TraceStatsPayload> {
  if (input.projectId) {
    await getProjectById(sqlite, input.projectId);
  }

  const taskSessionIds =
    input.taskId !== undefined
      ? collectTaskTraceSessionIds(await getTaskById(sqlite, input.taskId))
      : [];

  if (input.taskId) {
    if (taskSessionIds.length === 0) {
      return {
        byEventType: {},
        projectId: input.projectId ?? null,
        sessionId: input.sessionId ?? null,
        taskId: input.taskId,
        supervision: {
          averageCleanupLatencyMs: null,
          byModel: {},
          byProvider: {},
          byScope: {},
          bySessionKind: {
            standalone: 0,
            task_bound: 0,
          },
          byStage: {},
          cancelCompleted: 0,
          forceKilled: 0,
          maxCleanupLatencyMs: null,
          totalTimeouts: 0,
        },
        total: 0,
        uniqueSessions: 0,
      };
    }
  }

  const traceFilters = buildTraceFilters({
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskSessionIds,
  });
  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
      unique_sessions: sql<number>`count(distinct ${projectTracesTable.sessionId})`,
    })
    .from(projectTracesTable)
    .where(traceFilters)
    .get() as { count: number; unique_sessions: number };

  const rows = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
      event_type: projectTracesTable.eventType,
    })
    .from(projectTracesTable)
    .where(traceFilters)
    .groupBy(projectTracesTable.eventType)
    .all() as Array<{ count: number; event_type: string }>;

  const supervisionStageCounts: Record<string, number> = {};
  const supervisionTraceRows = getDrizzleDb(sqlite)
    .select({
      payload_json: projectTracesTable.payloadJson,
    })
    .from(projectTracesTable)
    .where(
      combineFilters([
        ...((traceFilters ? [traceFilters] : []) as SQL<unknown>[]),
        eq(projectTracesTable.eventType, 'supervision_update'),
      ]),
    )
    .all() as Array<{ payload_json: string }>;

  for (const row of supervisionTraceRows) {
    const payload = parsePayload(row.payload_json);
    const supervision =
      payload.supervision && typeof payload.supervision === 'object'
        ? (payload.supervision as Record<string, unknown>)
        : null;
    const stage =
      typeof supervision?.stage === 'string' ? supervision.stage : null;
    if (!stage) {
      continue;
    }

    supervisionStageCounts[stage] = (supervisionStageCounts[stage] ?? 0) + 1;
  }

  const sessionFilters: SQL<unknown>[] = [
    isNull(projectAcpSessionsTable.deletedAt),
    isNotNull(projectAcpSessionsTable.timeoutScope),
  ];
  if (input.projectId) {
    sessionFilters.push(eq(projectAcpSessionsTable.projectId, input.projectId));
  }
  if (input.sessionId) {
    sessionFilters.push(eq(projectAcpSessionsTable.id, input.sessionId));
  }
  if (input.taskId && taskSessionIds.length > 0) {
    sessionFilters.push(inArray(projectAcpSessionsTable.id, taskSessionIds));
  }

  const supervisionRows = getDrizzleDb(sqlite)
    .select({
      cancel_requested_at: projectAcpSessionsTable.cancelRequestedAt,
      completed_at: projectAcpSessionsTable.completedAt,
      force_killed_at: projectAcpSessionsTable.forceKilledAt,
      model: projectAcpSessionsTable.model,
      provider: projectAcpSessionsTable.provider,
      task_id: projectAcpSessionsTable.taskId,
      timeout_scope: projectAcpSessionsTable.timeoutScope,
    })
    .from(projectAcpSessionsTable)
    .where(combineFilters(sessionFilters))
    .all() as SupervisionSessionStatsRow[];

  const supervisionByScope: Record<string, number> = {};
  const supervisionByProvider: Record<string, number> = {};
  const supervisionByModel: Record<string, number> = {};
  const supervisionBySessionKind: Record<'standalone' | 'task_bound', number> = {
    standalone: 0,
    task_bound: 0,
  };
  let cancelCompleted = 0;
  let forceKilled = 0;
  const cleanupLatenciesMs: number[] = [];

  for (const row of supervisionRows) {
    if (row.timeout_scope) {
      supervisionByScope[row.timeout_scope] =
        (supervisionByScope[row.timeout_scope] ?? 0) + 1;
    }

    supervisionByProvider[row.provider] =
      (supervisionByProvider[row.provider] ?? 0) + 1;
    supervisionByModel[row.model ?? 'default'] =
      (supervisionByModel[row.model ?? 'default'] ?? 0) + 1;
    supervisionBySessionKind[row.task_id ? 'task_bound' : 'standalone'] += 1;

    if (row.force_killed_at) {
      forceKilled += 1;
    } else if (row.cancel_requested_at && row.completed_at) {
      cancelCompleted += 1;
    }

    const cancelRequestedAtMs = row.cancel_requested_at
      ? Date.parse(row.cancel_requested_at)
      : Number.NaN;
    const cleanupAtMs = row.force_killed_at
      ? Date.parse(row.force_killed_at)
      : row.completed_at
        ? Date.parse(row.completed_at)
        : Number.NaN;

    if (!Number.isNaN(cancelRequestedAtMs) && !Number.isNaN(cleanupAtMs)) {
      cleanupLatenciesMs.push(cleanupAtMs - cancelRequestedAtMs);
    }
  }

  const averageCleanupLatencyMs =
    cleanupLatenciesMs.length > 0
      ? Math.round(
          cleanupLatenciesMs.reduce((sum, value) => sum + value, 0) /
            cleanupLatenciesMs.length,
        )
      : null;
  const maxCleanupLatencyMs =
    cleanupLatenciesMs.length > 0 ? Math.max(...cleanupLatenciesMs) : null;

  return {
    byEventType: Object.fromEntries(
      rows.map((row) => [row.event_type, row.count]),
    ),
    projectId: input.projectId ?? null,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    supervision: {
      averageCleanupLatencyMs,
      byModel: supervisionByModel,
      byProvider: supervisionByProvider,
      byScope: supervisionByScope,
      bySessionKind: supervisionBySessionKind,
      byStage: supervisionStageCounts,
      cancelCompleted,
      forceKilled,
      maxCleanupLatencyMs,
      totalTimeouts: supervisionRows.length,
    },
    total: total.count,
    uniqueSessions: total.unique_sessions,
  };
}
