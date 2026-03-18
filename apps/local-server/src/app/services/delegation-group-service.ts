import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type { TaskPayload } from '../schemas/task';
import { getAcpSessionById } from './acp-service';
import { getTaskById } from './task-service';

const delegationGroupIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

type DelegationGroupStatus = 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface DelegationGroupRow {
  caller_session_id: string;
  completed_at: string | null;
  created_at: string;
  failure_reason: string | null;
  id: string;
  parent_session_id: string | null;
  project_id: string;
  session_ids_json: string;
  status: DelegationGroupStatus | 'ACTIVE';
  task_ids_json: string;
  updated_at: string;
}

interface DelegationGroupTaskRow {
  id: string;
}

export interface DelegationGroupPayload {
  callerSessionId: string;
  completedAt: string | null;
  createdAt: string;
  failureReason: string | null;
  id: string;
  parentSessionId: string | null;
  projectId: string;
  sessionIds: string[];
  status: DelegationGroupStatus;
  taskIds: string[];
  updatedAt: string;
}

export interface DelegationGroupProgressPayload {
  callerSessionId: string;
  completedCount: number;
  failureCount: number;
  groupId: string;
  parentSessionId: string | null;
  pendingCount: number;
  sessionIds: string[];
  settled: boolean;
  status: DelegationGroupStatus;
  taskIds: string[];
  totalCount: number;
}

const successfulTerminalTaskStatuses = new Set(['COMPLETED']);
const failedTerminalTaskStatuses = new Set([
  'WAITING_RETRY',
  'FAILED',
  'CANCELLED',
]);
const terminalTaskStatuses = new Set([
  ...successfulTerminalTaskStatuses,
  ...failedTerminalTaskStatuses,
]);

function createDelegationGroupId() {
  return `dg_${delegationGroupIdGenerator()}`;
}

function parseStringArray(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))];
}

function normalizeDelegationGroupStatus(
  status: DelegationGroupRow['status'],
): DelegationGroupStatus {
  return status === 'ACTIVE' ? 'RUNNING' : status;
}

function mapDelegationGroupRow(row: DelegationGroupRow): DelegationGroupPayload {
  return {
    callerSessionId: row.caller_session_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    failureReason: row.failure_reason,
    id: row.id,
    parentSessionId: row.parent_session_id,
    projectId: row.project_id,
    sessionIds: parseStringArray(row.session_ids_json),
    status: normalizeDelegationGroupStatus(row.status),
    taskIds: parseStringArray(row.task_ids_json),
    updatedAt: row.updated_at,
  };
}

function throwDelegationGroupNotFound(groupId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/delegation-group-not-found',
    title: 'Delegation Group Not Found',
    status: 404,
    detail: `Delegation group ${groupId} was not found`,
    context: {
      groupId,
    },
  });
}

function getDelegationGroupRow(
  sqlite: Database,
  groupId: string,
): DelegationGroupRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          caller_session_id,
          parent_session_id,
          status,
          completed_at,
          created_at,
          updated_at,
          task_ids_json,
          session_ids_json,
          failure_reason
        FROM project_delegation_groups
        WHERE id = ?
      `,
    )
    .get(groupId) as DelegationGroupRow | undefined;

  if (!row) {
    throwDelegationGroupNotFound(groupId);
  }

  return row;
}

function mergeGroupMembers(
  current: string[],
  next: Array<string | null | undefined>,
) {
  return dedupeStrings([...current, ...next]);
}

function isSuccessfulSettledTask(task: Pick<TaskPayload, 'resultSessionId' | 'status'>) {
  return (
    task.resultSessionId !== null &&
      !failedTerminalTaskStatuses.has(task.status)
      ? true
      : successfulTerminalTaskStatuses.has(task.status)
  );
}

function isFailedSettledTask(task: Pick<TaskPayload, 'status'>) {
  return failedTerminalTaskStatuses.has(task.status);
}

function isSettledTask(task: Pick<TaskPayload, 'resultSessionId' | 'status'>) {
  return task.resultSessionId !== null || terminalTaskStatuses.has(task.status);
}

function resolveDelegationGroupStatus(
  group: DelegationGroupPayload,
  tasks: TaskPayload[],
): DelegationGroupStatus {
  if (tasks.length === 0 && group.sessionIds.length === 0) {
    return 'OPEN';
  }

  const settledCount = tasks.filter((task) => isSettledTask(task)).length;
  const failedCount = tasks.filter((task) => isFailedSettledTask(task)).length;

  if (tasks.length > 0 && settledCount >= tasks.length) {
    return failedCount > 0 ? 'FAILED' : 'COMPLETED';
  }

  return 'RUNNING';
}

function resolveDelegationGroupCompletionTime(
  status: DelegationGroupStatus,
  currentCompletedAt: string | null,
) {
  if (status === 'COMPLETED' || status === 'FAILED') {
    return currentCompletedAt ?? new Date().toISOString();
  }

  return null;
}

function resolveDelegationGroupFailureReason(tasks: TaskPayload[]) {
  const failedTask = tasks.find((task) => isFailedSettledTask(task));
  if (!failedTask) {
    return null;
  }

  return failedTask.completionSummary ?? failedTask.verificationVerdict ?? failedTask.status;
}

async function persistDelegationGroup(
  sqlite: Database,
  input: {
    completedAt: string | null;
    failureReason?: string | null;
    groupId: string;
    parentSessionId?: string | null;
    sessionIds?: string[];
    status: DelegationGroupStatus;
    taskIds?: string[];
  },
) {
  const current = getDelegationGroupRow(sqlite, input.groupId);
  const currentPayload = mapDelegationGroupRow(current);

  sqlite
    .prepare(
      `
        UPDATE project_delegation_groups
        SET
          parent_session_id = @parentSessionId,
          status = @status,
          completed_at = @completedAt,
          updated_at = @updatedAt,
          task_ids_json = @taskIdsJson,
          session_ids_json = @sessionIdsJson,
          failure_reason = @failureReason
        WHERE id = @id
      `,
    )
    .run({
      completedAt: input.completedAt,
      failureReason:
        input.failureReason === undefined
          ? current.failure_reason
          : input.failureReason,
      id: input.groupId,
      parentSessionId:
        input.parentSessionId === undefined
          ? current.parent_session_id
          : input.parentSessionId,
      sessionIdsJson: JSON.stringify(
        input.sessionIds ?? currentPayload.sessionIds,
      ),
      status: input.status,
      taskIdsJson: JSON.stringify(input.taskIds ?? currentPayload.taskIds),
      updatedAt: new Date().toISOString(),
    });

  return await getDelegationGroupById(sqlite, input.groupId);
}

export async function getDelegationGroupById(
  sqlite: Database,
  groupId: string,
): Promise<DelegationGroupPayload> {
  return mapDelegationGroupRow(getDelegationGroupRow(sqlite, groupId));
}

export async function getActiveDelegationGroupByCallerSessionId(
  sqlite: Database,
  input: {
    callerSessionId: string;
    projectId: string;
  },
): Promise<DelegationGroupPayload | null> {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          caller_session_id,
          parent_session_id,
          status,
          completed_at,
          created_at,
          updated_at,
          task_ids_json,
          session_ids_json,
          failure_reason
        FROM project_delegation_groups
        WHERE project_id = @projectId
          AND caller_session_id = @callerSessionId
          AND status IN ('OPEN', 'RUNNING', 'ACTIVE')
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(input) as DelegationGroupRow | undefined;

  return row ? mapDelegationGroupRow(row) : null;
}

export async function getOrCreateActiveDelegationGroup(
  sqlite: Database,
  input: {
    callerSessionId: string;
    parentSessionId?: string | null;
    projectId: string;
  },
): Promise<DelegationGroupPayload> {
  const existing = await getActiveDelegationGroupByCallerSessionId(sqlite, input);

  if (existing) {
    if (
      input.parentSessionId &&
      existing.parentSessionId !== input.parentSessionId
    ) {
      return await persistDelegationGroup(sqlite, {
        completedAt: existing.completedAt,
        groupId: existing.id,
        parentSessionId: input.parentSessionId,
        status: existing.status,
      });
    }

    return existing;
  }

  const now = new Date().toISOString();
  const group: DelegationGroupPayload = {
    callerSessionId: input.callerSessionId,
    completedAt: null,
    createdAt: now,
    failureReason: null,
    id: createDelegationGroupId(),
    parentSessionId: input.parentSessionId ?? input.callerSessionId,
    projectId: input.projectId,
    sessionIds: [],
    status: 'OPEN',
    taskIds: [],
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO project_delegation_groups (
          id,
          project_id,
          caller_session_id,
          parent_session_id,
          status,
          completed_at,
          created_at,
          updated_at,
          task_ids_json,
          session_ids_json,
          failure_reason
        )
        VALUES (
          @id,
          @projectId,
          @callerSessionId,
          @parentSessionId,
          @status,
          @completedAt,
          @createdAt,
          @updatedAt,
          @taskIdsJson,
          @sessionIdsJson,
          @failureReason
        )
      `,
    )
    .run({
      callerSessionId: group.callerSessionId,
      completedAt: group.completedAt,
      createdAt: group.createdAt,
      failureReason: group.failureReason,
      id: group.id,
      parentSessionId: group.parentSessionId,
      projectId: group.projectId,
      sessionIdsJson: JSON.stringify(group.sessionIds),
      status: group.status,
      taskIdsJson: JSON.stringify(group.taskIds),
      updatedAt: group.updatedAt,
    });

  return group;
}

export async function registerDelegationGroupTask(
  sqlite: Database,
  input: {
    groupId: string;
    taskId: string;
  },
): Promise<DelegationGroupPayload> {
  const [group, task] = await Promise.all([
    getDelegationGroupById(sqlite, input.groupId),
    getTaskById(sqlite, input.taskId),
  ]);

  if (group.projectId !== task.projectId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/delegation-group-task-project-mismatch',
      title: 'Delegation Group Task Project Mismatch',
      status: 409,
      detail: `Task ${task.id} does not belong to delegation group ${group.id}`,
    });
  }

  return await persistDelegationGroup(sqlite, {
    completedAt: group.completedAt,
    groupId: group.id,
    status: group.status === 'OPEN' ? 'RUNNING' : group.status,
    taskIds: mergeGroupMembers(group.taskIds, [task.id]),
  });
}

export async function registerDelegationGroupSession(
  sqlite: Database,
  input: {
    groupId: string;
    sessionId: string;
    taskId?: string | null;
  },
): Promise<DelegationGroupPayload> {
  const [group, session] = await Promise.all([
    getDelegationGroupById(sqlite, input.groupId),
    getAcpSessionById(sqlite, input.sessionId),
  ]);

  if (group.projectId !== session.project.id) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/delegation-group-session-project-mismatch',
      title: 'Delegation Group Session Project Mismatch',
      status: 409,
      detail:
        `Session ${session.id} does not belong to delegation group ${group.id}`,
    });
  }

  return await persistDelegationGroup(sqlite, {
    completedAt: group.completedAt,
    groupId: group.id,
    parentSessionId: group.parentSessionId ?? session.parentSession?.id ?? null,
    sessionIds: mergeGroupMembers(group.sessionIds, [session.id]),
    status: group.status === 'OPEN' ? 'RUNNING' : group.status,
    taskIds: mergeGroupMembers(group.taskIds, [input.taskId]),
  });
}

export async function listDelegationGroupTasks(
  sqlite: Database,
  input: {
    groupId: string;
    projectId: string;
  },
): Promise<TaskPayload[]> {
  const group = await getDelegationGroupById(sqlite, input.groupId);
  const rows = sqlite
    .prepare(
      `
        SELECT id
        FROM project_tasks
        WHERE project_id = @projectId
          AND parallel_group = @groupId
          AND deleted_at IS NULL
        ORDER BY created_at ASC, updated_at ASC
      `,
    )
    .all(input) as DelegationGroupTaskRow[];
  const taskIds = mergeGroupMembers(group.taskIds, rows.map((row) => row.id));

  return await Promise.all(taskIds.map((taskId) => getTaskById(sqlite, taskId)));
}

export async function synchronizeDelegationGroupState(
  sqlite: Database,
  input: {
    groupId: string;
    projectId: string;
  },
) {
  const group = await getDelegationGroupById(sqlite, input.groupId);
  const tasks = await listDelegationGroupTasks(sqlite, input);
  const nextStatus = resolveDelegationGroupStatus(group, tasks);

  return await persistDelegationGroup(sqlite, {
    completedAt: resolveDelegationGroupCompletionTime(
      nextStatus,
      group.completedAt,
    ),
    failureReason:
      nextStatus === 'FAILED' ? resolveDelegationGroupFailureReason(tasks) : null,
    groupId: group.id,
    status: nextStatus,
    taskIds: mergeGroupMembers(group.taskIds, tasks.map((task) => task.id)),
  });
}

export async function completeDelegationGroup(
  sqlite: Database,
  groupId: string,
): Promise<DelegationGroupPayload> {
  const group = await getDelegationGroupById(sqlite, groupId);
  const nextStatus =
    group.failureReason || group.status === 'FAILED' ? 'FAILED' : 'COMPLETED';

  return await persistDelegationGroup(sqlite, {
    completedAt: resolveDelegationGroupCompletionTime(
      nextStatus,
      group.completedAt,
    ),
    groupId,
    status: nextStatus,
  });
}

export async function getDelegationGroupProgress(
  sqlite: Database,
  input: {
    groupId: string;
    projectId: string;
  },
): Promise<DelegationGroupProgressPayload> {
  const group = await synchronizeDelegationGroupState(sqlite, input);
  const tasks = await listDelegationGroupTasks(sqlite, input);
  const completedCount = tasks.filter((task) => isSuccessfulSettledTask(task)).length;
  const failureCount = tasks.filter((task) => isFailedSettledTask(task)).length;
  const settledCount = tasks.filter((task) => isSettledTask(task)).length;

  return {
    callerSessionId: group.callerSessionId,
    completedCount,
    failureCount,
    groupId: group.id,
    parentSessionId: group.parentSessionId,
    pendingCount: Math.max(tasks.length - settledCount, 0),
    sessionIds: group.sessionIds,
    settled: tasks.length > 0 && settledCount >= tasks.length,
    status: group.status,
    taskIds: mergeGroupMembers(group.taskIds, tasks.map((task) => task.id)),
    totalCount: tasks.length,
  };
}
