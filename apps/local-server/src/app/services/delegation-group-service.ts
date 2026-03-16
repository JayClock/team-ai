import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type { TaskPayload } from '../schemas/task';
import { getTaskById } from './task-service';

const delegationGroupIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface DelegationGroupRow {
  caller_session_id: string;
  completed_at: string | null;
  created_at: string;
  id: string;
  project_id: string;
  status: 'ACTIVE' | 'COMPLETED';
  updated_at: string;
}

interface DelegationGroupTaskRow {
  id: string;
}

export interface DelegationGroupPayload {
  callerSessionId: string;
  completedAt: string | null;
  createdAt: string;
  id: string;
  projectId: string;
  status: 'ACTIVE' | 'COMPLETED';
  updatedAt: string;
}

export interface DelegationGroupProgressPayload {
  callerSessionId: string;
  completedCount: number;
  groupId: string;
  pendingCount: number;
  settled: boolean;
  status: 'ACTIVE' | 'COMPLETED';
  taskIds: string[];
  totalCount: number;
}

const terminalTaskStatuses = new Set([
  'COMPLETED',
  'WAITING_RETRY',
  'FAILED',
  'CANCELLED',
]);

function createDelegationGroupId() {
  return `dg_${delegationGroupIdGenerator()}`;
}

function mapDelegationGroupRow(row: DelegationGroupRow): DelegationGroupPayload {
  return {
    callerSessionId: row.caller_session_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    id: row.id,
    projectId: row.project_id,
    status: row.status,
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
          status,
          completed_at,
          created_at,
          updated_at
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

function isSettledTask(task: Pick<TaskPayload, 'resultSessionId' | 'status'>) {
  return (
    task.resultSessionId !== null || terminalTaskStatuses.has(task.status)
  );
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
          status,
          completed_at,
          created_at,
          updated_at
        FROM project_delegation_groups
        WHERE project_id = @projectId
          AND caller_session_id = @callerSessionId
          AND status = 'ACTIVE'
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
    projectId: string;
  },
): Promise<DelegationGroupPayload> {
  const existing = await getActiveDelegationGroupByCallerSessionId(sqlite, input);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const group: DelegationGroupPayload = {
    callerSessionId: input.callerSessionId,
    completedAt: null,
    createdAt: now,
    id: createDelegationGroupId(),
    projectId: input.projectId,
    status: 'ACTIVE',
    updatedAt: now,
  };

  sqlite
    .prepare(
      `
        INSERT INTO project_delegation_groups (
          id,
          project_id,
          caller_session_id,
          status,
          completed_at,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @projectId,
          @callerSessionId,
          @status,
          @completedAt,
          @createdAt,
          @updatedAt
        )
      `,
    )
    .run(group);

  return group;
}

export async function completeDelegationGroup(
  sqlite: Database,
  groupId: string,
): Promise<DelegationGroupPayload> {
  const current = getDelegationGroupRow(sqlite, groupId);
  if (current.status === 'COMPLETED') {
    return mapDelegationGroupRow(current);
  }

  const completedAt = new Date().toISOString();
  sqlite
    .prepare(
      `
        UPDATE project_delegation_groups
        SET
          status = 'COMPLETED',
          completed_at = @completedAt,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      completedAt,
      id: groupId,
      updatedAt: completedAt,
    });

  return await getDelegationGroupById(sqlite, groupId);
}

export async function listDelegationGroupTasks(
  sqlite: Database,
  input: {
    groupId: string;
    projectId: string;
  },
): Promise<TaskPayload[]> {
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

  return await Promise.all(rows.map((row) => getTaskById(sqlite, row.id)));
}

export async function getDelegationGroupProgress(
  sqlite: Database,
  input: {
    groupId: string;
    projectId: string;
  },
): Promise<DelegationGroupProgressPayload> {
  const group = await getDelegationGroupById(sqlite, input.groupId);
  const tasks = await listDelegationGroupTasks(sqlite, input);
  const completedCount = tasks.filter((task) => isSettledTask(task)).length;

  return {
    callerSessionId: group.callerSessionId,
    completedCount,
    groupId: group.id,
    pendingCount: Math.max(tasks.length - completedCount, 0),
    settled: tasks.length > 0 && completedCount >= tasks.length,
    status: group.status,
    taskIds: tasks.map((task) => task.id),
    totalCount: tasks.length,
  };
}
