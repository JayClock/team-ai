import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type { DiagnosticLogger } from '../diagnostics';
import type { RoleValue } from '../schemas/role';
import type { TaskKind } from '../schemas/task';

const taskIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

const reviewKeywordPattern = /\b(review|check)\b|复核/i;
const verifyKeywordPattern = /\b(verify)\b|验收|验证/i;
const whitespacePattern = /\s+/g;
const maxTaskTitleLength = 120;

interface SyncableSessionRow {
  agent_role: RoleValue | null;
  parent_session_id: string | null;
  project_id: string;
  task_id: string | null;
}

interface PlanTaskDispatchCallbacks {
  createSession(input: {
    actorUserId: string;
    goal?: string;
    parentSessionId?: string | null;
    projectId: string;
    provider: string;
    role?: string | null;
    specialistId?: string;
    taskId?: string | null;
  }): Promise<{ id: string }>;
  isProviderAvailable?(provider: string): Promise<boolean> | boolean;
  promptSession(input: {
    projectId: string;
    prompt: string;
    sessionId: string;
  }): Promise<unknown>;
}

interface ExistingPlanTaskRow {
  id: string;
}

interface SyncPlanEventToTasksTransactionResult {
  createdCount: number;
  createdTaskIds: string[];
  session: SyncableSessionRow | null;
  skipped: boolean;
}

interface PlanEntryInput {
  content: string;
  priority?: 'high' | 'medium' | 'low' | null;
  status?: 'pending' | 'in_progress' | 'completed' | null;
}

export interface SyncPlanEventToTasksInput {
  emittedAt: string;
  entries: PlanEntryInput[];
  eventId: string;
  sessionId: string;
}

export interface SyncPlanEventToTasksResult {
  createdCount: number;
  skipped: boolean;
}

export interface SyncPlanEventAutoDispatchAttempt {
  dispatched: boolean;
  errorMessage: string | null;
  reason:
    | 'DISPATCH_ERROR'
    | 'TASK_ALREADY_DISPATCHING'
    | 'TASK_NOT_DISPATCHABLE'
    | null;
  sessionId: string | null;
  taskId: string;
}

export interface SyncPlanEventAutoDispatchResult {
  attempted: boolean;
  dispatchedCount: number;
  eligible: boolean;
  results: SyncPlanEventAutoDispatchAttempt[];
  skippedReason:
    | 'NO_NEW_TASKS'
    | 'PLAN_SYNC_SKIPPED'
    | 'SESSION_NOT_TOP_LEVEL_ROUTA'
    | null;
}

export interface SyncPlanEventToTasksAndDispatchResult extends SyncPlanEventToTasksResult {
  autoDispatch: SyncPlanEventAutoDispatchResult;
}

export interface SyncPlanEventToTasksAndDispatchOptions {
  logger?: DiagnosticLogger;
}

function createTaskId() {
  return `task_${taskIdGenerator()}`;
}

function getSyncableSession(
  sqlite: Database,
  sessionId: string,
): SyncableSessionRow | null {
  return (
    (sqlite
      .prepare(
        `
          SELECT
            session.project_id,
            session.parent_session_id,
            session.task_id,
            agent.role AS agent_role
          FROM project_acp_sessions AS session
          LEFT JOIN project_agents AS agent
            ON agent.id = session.agent_id
          WHERE session.id = ? AND session.deleted_at IS NULL
        `,
      )
      .get(sessionId) as SyncableSessionRow | undefined) ?? null
  );
}

function shouldSyncPlanForSession(session: SyncableSessionRow | null) {
  if (!session || session.task_id) {
    return false;
  }

  return session.parent_session_id === null || session.agent_role === 'ROUTA';
}

function shouldAutoDispatchPlanForSession(session: SyncableSessionRow | null) {
  return (
    session !== null &&
    session.task_id === null &&
    session.parent_session_id === null &&
    session.agent_role === 'ROUTA'
  );
}

function normalizePlanContent(content: string, entryIndex: number) {
  const normalized = content.trim().replace(whitespacePattern, ' ');

  return normalized || `Plan item ${entryIndex + 1}`;
}

function toTaskTitle(content: string) {
  if (content.length <= maxTaskTitleLength) {
    return content;
  }

  return `${content.slice(0, maxTaskTitleLength - 3).trimEnd()}...`;
}

function toTaskStatus(
  status: PlanEntryInput['status'],
): 'PENDING' | 'RUNNING' | 'COMPLETED' {
  switch (status) {
    case 'in_progress':
      return 'RUNNING';
    case 'completed':
      return 'COMPLETED';
    case 'pending':
    default:
      return 'PENDING';
  }
}

function inferTaskShape(
  content: string,
  sessionRole: RoleValue | null,
): { assignedRole: RoleValue; kind: TaskKind } {
  if (verifyKeywordPattern.test(content)) {
    return {
      kind: 'verify',
      assignedRole: 'GATE',
    };
  }

  if (reviewKeywordPattern.test(content)) {
    return {
      kind: 'review',
      assignedRole: 'GATE',
    };
  }

  if (sessionRole === 'DEVELOPER') {
    return {
      kind: 'implement',
      assignedRole: 'DEVELOPER',
    };
  }

  return {
    kind: 'implement',
    assignedRole: 'CRAFTER',
  };
}

const syncPlanEventToTasksInTransaction = (
  sqlite: Database,
  input: SyncPlanEventToTasksInput,
): SyncPlanEventToTasksTransactionResult => {
  const session = getSyncableSession(sqlite, input.sessionId);

  if (!session || !shouldSyncPlanForSession(session)) {
    return {
      createdCount: 0,
      createdTaskIds: [],
      session,
      skipped: true,
    };
  }

  const findExistingTask = sqlite.prepare(
    `
      SELECT id
      FROM project_tasks
      WHERE source_type = 'acp_plan'
        AND source_event_id = @eventId
        AND source_entry_index = @sourceEntryIndex
        AND deleted_at IS NULL
    `,
  );

  const insertTask = sqlite.prepare(
    `
      INSERT INTO project_tasks (
        id,
        project_id,
        trigger_session_id,
        title,
        objective,
        scope,
        status,
        board_id,
        column_id,
        position,
        priority,
        labels_json,
        assignee,
        assigned_provider,
        assigned_role,
        assigned_specialist_id,
        assigned_specialist_name,
        dependencies_json,
        parallel_group,
        acceptance_criteria_json,
        verification_commands_json,
        completion_summary,
        verification_verdict,
        verification_report,
        github_id,
        github_number,
        github_url,
        github_repo,
        github_state,
        github_synced_at,
        last_sync_error,
        kind,
        parent_task_id,
        execution_session_id,
        result_session_id,
        source_type,
        source_event_id,
        source_entry_index,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        @id,
        @projectId,
        @triggerSessionId,
        @title,
        @objective,
        NULL,
        @status,
        NULL,
        NULL,
        NULL,
        @priority,
        '[]',
        NULL,
        NULL,
        @assignedRole,
        NULL,
        NULL,
        '[]',
        NULL,
        '[]',
        '[]',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        @kind,
        NULL,
        NULL,
        NULL,
        'acp_plan',
        @sourceEventId,
        @sourceEntryIndex,
        @createdAt,
        @updatedAt,
        NULL
      )
    `,
  );

  let createdCount = 0;
  const createdTaskIds: string[] = [];

  for (const [index, entry] of input.entries.entries()) {
    const sourceEntryIndex = index;
    const existing = findExistingTask.get({
      eventId: input.eventId,
      sourceEntryIndex,
    }) as ExistingPlanTaskRow | undefined;

    if (existing) {
      continue;
    }

    const content = normalizePlanContent(entry.content, index);
    const taskShape = inferTaskShape(content, session.agent_role);
    const taskId = createTaskId();

    insertTask.run({
      assignedRole: taskShape.assignedRole,
      createdAt: input.emittedAt,
      id: taskId,
      kind: taskShape.kind,
      objective: content,
      priority: entry.priority ?? null,
      projectId: session.project_id,
      sourceEntryIndex,
      sourceEventId: input.eventId,
      status: toTaskStatus(entry.status),
      title: toTaskTitle(content),
      triggerSessionId: input.sessionId,
      updatedAt: input.emittedAt,
    });
    createdTaskIds.push(taskId);
    createdCount += 1;
  }

  return {
    createdCount,
    createdTaskIds,
    session,
    skipped: false,
  };
};

export function syncPlanEventToTasks(
  sqlite: Database,
  input: SyncPlanEventToTasksInput,
): SyncPlanEventToTasksResult {
  const transaction = sqlite.transaction(syncPlanEventToTasksInTransaction);
  const result = transaction(sqlite, input);

  return {
    createdCount: result.createdCount,
    skipped: result.skipped,
  };
}

export async function syncPlanEventToTasksAndDispatch(
  sqlite: Database,
  callbacks: PlanTaskDispatchCallbacks,
  input: SyncPlanEventToTasksInput,
  options: SyncPlanEventToTasksAndDispatchOptions = {},
): Promise<SyncPlanEventToTasksAndDispatchResult> {
  const transaction = sqlite.transaction(syncPlanEventToTasksInTransaction);
  const syncResult = transaction(sqlite, input);

  if (syncResult.skipped) {
    return {
      createdCount: syncResult.createdCount,
      skipped: true,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: false,
        results: [],
        skippedReason: 'PLAN_SYNC_SKIPPED',
      },
    };
  }

  const autoDispatchEligible = shouldAutoDispatchPlanForSession(
    syncResult.session,
  );

  if (!autoDispatchEligible) {
    return {
      createdCount: syncResult.createdCount,
      skipped: false,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: false,
        results: [],
        skippedReason: 'SESSION_NOT_TOP_LEVEL_ROUTA',
      },
    };
  }

  if (syncResult.createdTaskIds.length === 0) {
    return {
      createdCount: syncResult.createdCount,
      skipped: false,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: true,
        results: [],
        skippedReason: 'NO_NEW_TASKS',
      },
    };
  }

  const { dispatchTask } = await import('./task-dispatch-service.js');
  const results: SyncPlanEventAutoDispatchAttempt[] = [];

  for (const taskId of syncResult.createdTaskIds) {
    try {
      const dispatchResult = await dispatchTask(
        sqlite,
        callbacks,
        {
          taskId,
        },
        {
          logger: options.logger,
          source: 'plan_sync_auto_dispatch',
          triggerReason: 'PLAN_SYNC',
          triggerSource: 'automatic',
        },
      );

      results.push({
        dispatched: dispatchResult.dispatched,
        errorMessage: null,
        reason: dispatchResult.reason,
        sessionId: dispatchResult.sessionId,
        taskId,
      });
    } catch (error) {
      results.push({
        dispatched: false,
        errorMessage:
          error instanceof Error ? error.message : 'Task dispatch failed',
        reason: 'DISPATCH_ERROR',
        sessionId: null,
        taskId,
      });
    }
  }

  return {
    createdCount: syncResult.createdCount,
    skipped: false,
    autoDispatch: {
      attempted: true,
      dispatchedCount: results.filter((result) => result.dispatched).length,
      eligible: true,
      results,
      skippedReason: null,
    },
  };
}
