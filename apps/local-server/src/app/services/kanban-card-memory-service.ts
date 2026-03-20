import type { Database } from 'better-sqlite3';
import { asc, desc, inArray } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectTracesTable } from '../db/schema';
import type {
  KanbanCardMemoryPayload,
  KanbanCardTraceLinkPayload,
} from '../schemas/kanban';
import type {
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
  TaskPayload,
} from '../schemas/task';

interface KanbanMemorySource {
  completionSummary: string | null;
  laneHandoffs: TaskLaneHandoffPayload[];
  lastSyncError: string | null;
  status?: string;
  verificationReport: string | null;
  verificationVerdict: string | null;
}

function appendIfPresent(target: Set<string>, value: string | null | undefined) {
  const normalized = value?.trim();
  if (normalized) {
    target.add(normalized);
  }
}

export function collectTaskTraceSessionIds(input: {
  executionSessionId?: string | null;
  laneSessions: TaskLaneSessionPayload[];
  resultSessionId?: string | null;
  triggerSessionId?: string | null;
}) {
  return [...new Set([
    input.triggerSessionId ?? null,
    input.executionSessionId ?? null,
    input.resultSessionId ?? null,
    ...input.laneSessions.map((session) => session.sessionId),
  ])].filter((sessionId): sessionId is string => Boolean(sessionId));
}

export function deriveKanbanCardMemory(
  input: KanbanMemorySource,
): KanbanCardMemoryPayload {
  const decisions = new Set<string>();
  const blockers = new Set<string>();
  const resolvedNotes = new Set<string>();

  appendIfPresent(blockers, input.lastSyncError);

  for (const handoff of input.laneHandoffs) {
    if (handoff.requestType === 'policy_bypass') {
      appendIfPresent(decisions, handoff.responseSummary ?? handoff.request);
      continue;
    }

    if (handoff.status === 'blocked' || handoff.status === 'failed') {
      appendIfPresent(blockers, handoff.responseSummary ?? handoff.request);
      continue;
    }

    if (handoff.status === 'completed' || handoff.status === 'delivered') {
      appendIfPresent(resolvedNotes, handoff.responseSummary ?? handoff.request);
    }
  }

  if (input.verificationVerdict === 'fail') {
    appendIfPresent(blockers, input.verificationReport);
  } else {
    appendIfPresent(resolvedNotes, input.verificationReport);
  }

  return {
    blockers: [...blockers],
    decisions: [...decisions],
    doneSummary:
      input.status === 'COMPLETED'
        ? input.completionSummary ?? input.verificationReport
        : input.completionSummary,
    resolvedNotes: [...resolvedNotes],
  };
}

export function listTraceLinksForTask(
  sqlite: Database,
  input: Pick<
    TaskPayload,
    'executionSessionId' | 'laneSessions' | 'resultSessionId' | 'triggerSessionId'
  >,
): KanbanCardTraceLinkPayload[] {
  const sessionIds = collectTaskTraceSessionIds(input);
  if (sessionIds.length === 0) {
    return [];
  }

  const rows = getDrizzleDb(sqlite)
    .select({
      created_at: projectTracesTable.createdAt,
      id: projectTracesTable.id,
      session_id: projectTracesTable.sessionId,
      summary: projectTracesTable.summary,
    })
    .from(projectTracesTable)
    .where(inArray(projectTracesTable.sessionId, sessionIds))
    .orderBy(asc(projectTracesTable.sessionId), desc(projectTracesTable.createdAt))
    .all() as Array<{
      created_at: string;
      id: string;
      session_id: string;
      summary: string;
    }>;

  const links = new Map<string, KanbanCardTraceLinkPayload>();

  for (const row of rows) {
    const current = links.get(row.session_id);
    if (!current) {
      links.set(row.session_id, {
        lastCapturedAt: row.created_at,
        latestSummary: row.summary,
        sessionId: row.session_id,
        total: 1,
        traceId: row.id,
      });
      continue;
    }

    current.total += 1;
  }

  return [...links.values()].sort((left, right) => {
    return new Date(right.lastCapturedAt ?? 0).getTime() -
      new Date(left.lastCapturedAt ?? 0).getTime();
  });
}
