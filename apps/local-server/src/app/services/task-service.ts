import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import { projectTasksTable } from '../db/schema';
import type {
  CreateTaskInput,
  TaskKind,
  TaskLaneHandoffPayload,
  TaskLaneSessionPayload,
  TaskListPayload,
  TaskPayload,
  UpdateTaskInput,
} from '../schemas/task';
import { getProjectById } from './project-service';
import { getAcpSessionById } from './acp-service';
import { getProjectCodebaseById } from './project-codebase-service';
import { getProjectWorktreeById } from './project-worktree-service';
import {
  ensureRoleValue,
  getSpecialistById,
  throwSpecialistRoleMismatch,
} from './specialist-service';
import { resolveTaskWorkflowContext } from './task-workflow-service';

const taskIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface TaskRow {
  acceptance_criteria_json: string;
  assigned_provider: string | null;
  assigned_role: string | null;
  assigned_specialist_id: string | null;
  assigned_specialist_name: string | null;
  assignee: string | null;
  board_id: string | null;
  codebase_id: string | null;
  column_id: string | null;
  completion_summary: string | null;
  created_at: string;
  dependencies_json: string;
  github_id: string | null;
  github_number: number | null;
  github_repo: string | null;
  github_state: string | null;
  github_synced_at: string | null;
  github_url: string | null;
  id: string;
  kind: TaskKind | null;
  labels_json: string;
  last_sync_error: string | null;
  objective: string;
  execution_session_id: string | null;
  parallel_group: string | null;
  parent_task_id: string | null;
  position: number | null;
  priority: string | null;
  project_id: string;
  result_session_id: string | null;
  session_id: string | null;
  scope: string | null;
  session_ids_json: string;
  source_entry_index: number | null;
  source_event_id: string | null;
  source_type: string;
  status: string;
  title: string;
  trigger_session_id: string | null;
  updated_at: string;
  verification_commands_json: string;
  verification_report: string | null;
  verification_verdict: string | null;
  lane_handoffs_json: string;
  lane_sessions_json: string;
  worktree_id: string | null;
  workspace_id: string | null;
  codebase_ids_json: string;
}

interface ListTasksQuery {
  page: number;
  pageSize: number;
  projectId?: string;
  sessionId?: string;
  status?: string;
}

interface DependentTaskRow {
  id: string;
}

interface ColumnTaskPositionRow {
  id: string;
  position: number | null;
  updated_at: string;
}

const taskRowSelection = {
  acceptance_criteria_json: projectTasksTable.acceptanceCriteriaJson,
  assigned_provider: projectTasksTable.assignedProvider,
  assigned_role: projectTasksTable.assignedRole,
  assigned_specialist_id: projectTasksTable.assignedSpecialistId,
  assigned_specialist_name: projectTasksTable.assignedSpecialistName,
  assignee: projectTasksTable.assignee,
  board_id: projectTasksTable.boardId,
  codebase_id: projectTasksTable.codebaseId,
  codebase_ids_json: projectTasksTable.codebaseIdsJson,
  column_id: projectTasksTable.columnId,
  completion_summary: projectTasksTable.completionSummary,
  created_at: projectTasksTable.createdAt,
  dependencies_json: projectTasksTable.dependenciesJson,
  execution_session_id: projectTasksTable.executionSessionId,
  github_id: projectTasksTable.githubId,
  github_number: projectTasksTable.githubNumber,
  github_repo: projectTasksTable.githubRepo,
  github_state: projectTasksTable.githubState,
  github_synced_at: projectTasksTable.githubSyncedAt,
  github_url: projectTasksTable.githubUrl,
  id: projectTasksTable.id,
  kind: projectTasksTable.kind,
  labels_json: projectTasksTable.labelsJson,
  lane_handoffs_json: projectTasksTable.laneHandoffsJson,
  lane_sessions_json: projectTasksTable.laneSessionsJson,
  last_sync_error: projectTasksTable.lastSyncError,
  objective: projectTasksTable.objective,
  parallel_group: projectTasksTable.parallelGroup,
  parent_task_id: projectTasksTable.parentTaskId,
  position: projectTasksTable.position,
  priority: projectTasksTable.priority,
  project_id: projectTasksTable.projectId,
  result_session_id: projectTasksTable.resultSessionId,
  session_id: projectTasksTable.sessionId,
  session_ids_json: projectTasksTable.sessionIdsJson,
  scope: projectTasksTable.scope,
  source_entry_index: projectTasksTable.sourceEntryIndex,
  source_event_id: projectTasksTable.sourceEventId,
  source_type: projectTasksTable.sourceType,
  status: projectTasksTable.status,
  title: projectTasksTable.title,
  trigger_session_id: projectTasksTable.triggerSessionId,
  updated_at: projectTasksTable.updatedAt,
  verification_commands_json: projectTasksTable.verificationCommandsJson,
  verification_report: projectTasksTable.verificationReport,
  verification_verdict: projectTasksTable.verificationVerdict,
  workspace_id: projectTasksTable.workspaceId,
  worktree_id: projectTasksTable.worktreeId,
} as const;

export const taskStatusValues = [
  'PENDING',
  'READY',
  'RUNNING',
  'WAITING_RETRY',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type TaskStatus = (typeof taskStatusValues)[number];

function createTaskId() {
  return `task_${taskIdGenerator()}`;
}

function combineFilters(filters: SQL<unknown>[]) {
  return filters.length === 1 ? filters[0] : and(...filters);
}

const taskKindValues = ['plan', 'implement', 'review', 'verify'] as const;
const mcpWritableTaskStatuses = new Set<TaskStatus>([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'CANCELLED',
]);
const mcpTaskStatusTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ['READY', 'CANCELLED'],
  READY: ['PENDING', 'WAITING_RETRY', 'CANCELLED'],
  RUNNING: ['WAITING_RETRY', 'CANCELLED'],
  WAITING_RETRY: ['READY', 'CANCELLED'],
  COMPLETED: [],
  FAILED: ['WAITING_RETRY', 'CANCELLED'],
  CANCELLED: ['PENDING', 'READY'],
};

function throwInvalidTaskKind(kind: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-task-kind',
    title: 'Invalid Task Kind',
    status: 400,
    detail: `Task kind ${kind} is not supported`,
  });
}

function throwInvalidTaskStatus(status: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-task-status',
    title: 'Invalid Task Status',
    status: 400,
    detail: `Task status ${status} is not supported`,
  });
}

function throwTaskParentSelfReference(taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-parent-self-reference',
    title: 'Task Parent Self Reference',
    status: 409,
    detail: `Task ${taskId} cannot be its own parent`,
  });
}

function throwTaskProjectMismatch(projectId: string, taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-project-mismatch',
    title: 'Task Project Mismatch',
    status: 409,
    detail: `Task ${taskId} does not belong to project ${projectId}`,
    context: {
      projectId,
      taskId,
    },
  });
}

function throwTaskStatusNotWritableViaMcp(
  taskId: string,
  status: TaskStatus,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-status-not-mcp-writable',
    title: 'Task Status Not MCP Writable',
    status: 409,
    detail: `Task ${taskId} status ${status} cannot be written via MCP`,
    context: {
      status,
      taskId,
    },
  });
}

function throwTaskStatusTransitionNotAllowed(
  taskId: string,
  currentStatus: TaskStatus,
  nextStatus: TaskStatus,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-status-transition-not-allowed',
    title: 'Task Status Transition Not Allowed',
    status: 409,
    detail: `Task ${taskId} cannot transition from ${currentStatus} to ${nextStatus}`,
    context: {
      currentStatus,
      nextStatus,
      taskId,
    },
  });
}

function throwTaskWorktreeCodebaseMismatch(
  projectId: string,
  codebaseId: string,
  worktreeId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-worktree-codebase-mismatch',
    title: 'Task Worktree Codebase Mismatch',
    status: 409,
    detail:
      `Worktree ${worktreeId} does not belong to codebase ${codebaseId} in project ${projectId}`,
    context: {
      codebaseId,
      projectId,
      worktreeId,
    },
  });
}

function isTaskKind(value: string): value is TaskKind {
  return taskKindValues.includes(value as TaskKind);
}

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatusValues.includes(value as TaskStatus);
}

function ensureTaskStatus(
  status: string | null | undefined,
  fallback: TaskStatus,
): TaskStatus {
  if (status === null || status === undefined) {
    return fallback;
  }

  if (!isTaskStatus(status)) {
    throwInvalidTaskStatus(status);
  }

  return status;
}

function defaultTaskKindForRole(role: string | null | undefined): TaskKind {
  switch (role) {
    case 'ROUTA':
      return 'plan';
    case 'GATE':
      return 'review';
    case 'CRAFTER':
    case 'DEVELOPER':
    default:
      return 'implement';
  }
}

function ensureTaskKind(
  kind: string | null | undefined,
  role: string | null | undefined,
): TaskKind | null {
  if (kind === undefined) {
    return defaultTaskKindForRole(role);
  }

  if (kind === null) {
    return null;
  }

  if (!isTaskKind(kind)) {
    throwInvalidTaskKind(kind);
  }

  return kind;
}

function ensureTaskStatusWritableViaMcp(
  taskId: string,
  currentStatus: TaskStatus,
  nextStatus: TaskStatus,
) {
  if (!mcpWritableTaskStatuses.has(nextStatus)) {
    throwTaskStatusNotWritableViaMcp(taskId, nextStatus);
  }

  if (currentStatus === nextStatus) {
    return;
  }

  if (!mcpTaskStatusTransitions[currentStatus].includes(nextStatus)) {
    throwTaskStatusTransitionNotAllowed(taskId, currentStatus, nextStatus);
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseObjectArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is T =>
            typeof item === 'object' && item !== null && !Array.isArray(item),
        )
      : [];
  } catch {
    return [];
  }
}

function dedupeStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values));
}

function nextUpdatedAt(currentUpdatedAt: string | null | undefined): string {
  const previousTimestamp = currentUpdatedAt ? Date.parse(currentUpdatedAt) : NaN;
  const now = Date.now();
  const nextTimestamp = Number.isNaN(previousTimestamp)
    ? now
    : Math.max(now, previousTimestamp + 1);

  return new Date(nextTimestamp).toISOString();
}

function getNextTaskPosition(
  sqlite: Database,
  projectId: string,
  boardId: string,
  columnId: string,
  excludeTaskId?: string,
) {
  const filters = [
    eq(projectTasksTable.projectId, projectId),
    eq(projectTasksTable.boardId, boardId),
    eq(projectTasksTable.columnId, columnId),
    isNull(projectTasksTable.deletedAt),
  ];

  if (excludeTaskId) {
    filters.push(ne(projectTasksTable.id, excludeTaskId));
  }

  const row = getDrizzleDb(sqlite)
    .select({
      max_position: sql<number>`coalesce(max(${projectTasksTable.position}), -1)`,
    })
    .from(projectTasksTable)
    .where(combineFilters(filters))
    .get() as { max_position: number | null };

  return (row.max_position ?? -1) + 1;
}

function listColumnTaskPositionRows(
  sqlite: Database,
  projectId: string,
  boardId: string,
  columnId: string,
  excludeTaskId?: string,
) {
  const filters = [
    eq(projectTasksTable.projectId, projectId),
    eq(projectTasksTable.boardId, boardId),
    eq(projectTasksTable.columnId, columnId),
    isNull(projectTasksTable.deletedAt),
  ];

  if (excludeTaskId) {
    filters.push(ne(projectTasksTable.id, excludeTaskId));
  }

  return getDrizzleDb(sqlite)
    .select({
      id: projectTasksTable.id,
      position: projectTasksTable.position,
      updated_at: projectTasksTable.updatedAt,
    })
    .from(projectTasksTable)
    .where(combineFilters(filters))
    .orderBy(
      sql`case when ${projectTasksTable.position} is null then 1 else 0 end`,
      asc(projectTasksTable.position),
      desc(projectTasksTable.updatedAt),
      desc(projectTasksTable.createdAt),
    )
    .all() as ColumnTaskPositionRow[];
}

function writeColumnTaskPositions(
  sqlite: Database,
  taskIds: string[],
) {
  const transaction = sqlite.transaction((ids: string[]) => {
    const db = getDrizzleDb(sqlite);
    ids.forEach((id, index) => {
      db.update(projectTasksTable)
        .set({
          position: index,
        })
        .where(
          and(
            eq(projectTasksTable.id, id),
            isNull(projectTasksTable.deletedAt),
          ),
        )
        .run();
    });
  });

  transaction(taskIds);
}

export function normalizeTaskPositionsInColumn(
  sqlite: Database,
  projectId: string,
  boardId: string | null,
  columnId: string | null,
) {
  if (!boardId || !columnId) {
    return;
  }

  const rows = listColumnTaskPositionRows(sqlite, projectId, boardId, columnId);
  writeColumnTaskPositions(
    sqlite,
    rows.map((row) => row.id),
  );
}

export function placeTaskInColumn(
  sqlite: Database,
  input: {
    boardId: string | null;
    columnId: string | null;
    position: number | null | undefined;
    projectId: string;
    taskId: string;
  },
) {
  if (!input.boardId || !input.columnId) {
    return;
  }

  const rows = listColumnTaskPositionRows(
    sqlite,
    input.projectId,
    input.boardId,
    input.columnId,
    input.taskId,
  );
  const taskIds = rows.map((row) => row.id);
  const nextPosition =
    input.position == null
      ? taskIds.length
      : Math.max(0, Math.min(input.position, taskIds.length));

  taskIds.splice(nextPosition, 0, input.taskId);
  writeColumnTaskPositions(sqlite, taskIds);
}

function mapTaskRow(row: TaskRow): TaskPayload {
  return {
    acceptanceCriteria: parseStringArray(row.acceptance_criteria_json),
    assignedProvider: row.assigned_provider,
    assignedRole: row.assigned_role,
    assignedSpecialistId: row.assigned_specialist_id,
    assignedSpecialistName: row.assigned_specialist_name,
    assignee: row.assignee,
    boardId: row.board_id,
    codebaseId: row.codebase_id,
    columnId: row.column_id,
    completionSummary: row.completion_summary,
    createdAt: row.created_at,
    dependencies: parseStringArray(row.dependencies_json),
    githubId: row.github_id,
    githubNumber: row.github_number,
    githubRepo: row.github_repo,
    githubState: row.github_state,
    githubSyncedAt: row.github_synced_at,
    githubUrl: row.github_url,
    id: row.id,
    kind: row.kind,
    laneHandoffs: parseObjectArray<TaskLaneHandoffPayload>(
      row.lane_handoffs_json,
    ),
    laneSessions: parseObjectArray<TaskLaneSessionPayload>(
      row.lane_sessions_json,
    ),
    labels: parseStringArray(row.labels_json),
    lastSyncError: row.last_sync_error,
    objective: row.objective,
    executionSessionId: row.execution_session_id,
    parallelGroup: row.parallel_group,
    parentTaskId: row.parent_task_id,
    position: row.position,
    priority: row.priority,
    projectId: row.project_id,
    resultSessionId: row.result_session_id,
    sessionIds: parseStringArray(row.session_ids_json),
    sessionId: row.session_id,
    scope: row.scope,
    sourceEntryIndex: row.source_entry_index,
    sourceEventId: row.source_event_id,
    sourceType: row.source_type,
    status: row.status,
    title: row.title,
    triggerSessionId: row.trigger_session_id,
    updatedAt: row.updated_at,
    verificationCommands: parseStringArray(row.verification_commands_json),
    verificationReport: row.verification_report,
    verificationVerdict: row.verification_verdict,
    workspaceId: row.workspace_id ?? row.project_id,
    codebaseIds: dedupeStrings([
      ...parseStringArray(row.codebase_ids_json),
      ...(row.codebase_id ? [row.codebase_id] : []),
    ]),
    worktreeId: row.worktree_id,
  };
}

function throwTaskNotFound(taskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-not-found',
    title: 'Task Not Found',
    status: 404,
    detail: `Task ${taskId} was not found`,
  });
}

function throwTaskSessionProjectMismatch(
  projectId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-session-project-mismatch',
    title: 'Task Session Project Mismatch',
    status: 409,
    detail: `Task project ${projectId} does not match session ${sessionId}`,
    context: {
      projectId,
      sessionId,
    },
  });
}

async function resolveTaskAssignment(
  sqlite: Database,
  input: {
    assignedRole?: string | null;
    assignedSpecialistId?: string | null;
    assignedSpecialistName?: string | null;
    projectId: string;
  },
) {
  const assignedRole = ensureRoleValue(input.assignedRole);

  if (!input.assignedSpecialistId) {
    return {
      assignedRole,
      assignedSpecialistId: null,
      assignedSpecialistName: input.assignedSpecialistName ?? null,
    };
  }

  const specialist = await getSpecialistById(
    sqlite,
    input.projectId,
    input.assignedSpecialistId,
  );

  if (assignedRole && assignedRole !== specialist.role) {
    throwSpecialistRoleMismatch(specialist.id, assignedRole, specialist.role);
  }

  return {
    assignedRole: specialist.role,
    assignedSpecialistId: specialist.id,
    assignedSpecialistName: input.assignedSpecialistName ?? specialist.name,
  };
}

function getTaskRow(sqlite: Database, taskId: string): TaskRow {
  const row = getDrizzleDb(sqlite)
    .select(taskRowSelection)
    .from(projectTasksTable)
    .where(
      and(
        eq(projectTasksTable.id, taskId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .get() as TaskRow | undefined;

  if (!row) {
    throwTaskNotFound(taskId);
  }

  return row;
}

async function validateTriggerSession(
  sqlite: Database,
  projectId: string,
  sessionId?: string | null,
) {
  if (!sessionId) {
    return null;
  }

  const session = await getAcpSessionById(sqlite, sessionId);

  if (session.project.id !== projectId) {
    throwTaskSessionProjectMismatch(projectId, sessionId);
  }

  return sessionId;
}

async function validateTaskReference(
  sqlite: Database,
  projectId: string,
  taskId?: string | null,
) {
  if (!taskId) {
    return null;
  }

  const row = getDrizzleDb(sqlite)
    .select({
      id: projectTasksTable.id,
      project_id: projectTasksTable.projectId,
    })
    .from(projectTasksTable)
    .where(
      and(
        eq(projectTasksTable.id, taskId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .get() as { id: string; project_id: string } | undefined;

  if (!row) {
    throwTaskNotFound(taskId);
  }

  if (row.project_id !== projectId) {
    throwTaskProjectMismatch(projectId, taskId);
  }

  return taskId;
}

async function resolveTaskWorkspaceBinding(
  sqlite: Database,
  projectId: string,
  input: {
    codebaseId?: string | null;
    codebaseIds?: string[];
    worktreeId?: string | null;
  },
  current?: {
    codebaseId: string | null;
    codebaseIds?: string[];
    worktreeId: string | null;
  },
) {
  let codebaseIds =
    input.codebaseIds === undefined
      ? dedupeStrings(current?.codebaseIds ?? [])
      : dedupeStrings(input.codebaseIds);
  let codebaseId =
    input.codebaseId === undefined
      ? (codebaseIds[0] ?? current?.codebaseId ?? null)
      : input.codebaseId;
  let worktreeId =
    input.worktreeId === undefined
      ? (current?.worktreeId ?? null)
      : input.worktreeId;

  if (input.codebaseId !== undefined) {
    codebaseIds =
      input.codebaseId === null
        ? []
        : dedupeStrings([input.codebaseId, ...codebaseIds]);
  }

  if (input.codebaseIds !== undefined && input.codebaseIds.length === 0) {
    codebaseId = input.codebaseId === undefined ? null : codebaseId;

    if (input.worktreeId === undefined) {
      worktreeId = null;
    }
  }

  if (input.codebaseId !== undefined && input.worktreeId === undefined) {
    if (input.codebaseId === null) {
      worktreeId = null;
    } else if (current?.worktreeId) {
      const currentWorktree = await getProjectWorktreeById(
        sqlite,
        projectId,
        current.worktreeId,
      ).catch(() => null);

      if (currentWorktree && currentWorktree.codebaseId !== input.codebaseId) {
        worktreeId = null;
      }
    }
  }

  if (worktreeId) {
    const worktree = await getProjectWorktreeById(sqlite, projectId, worktreeId);

    if (codebaseId && codebaseId !== worktree.codebaseId) {
      throwTaskWorktreeCodebaseMismatch(projectId, codebaseId, worktreeId);
    }

    codebaseId = worktree.codebaseId;
    codebaseIds = dedupeStrings([worktree.codebaseId, ...codebaseIds]);
  }

  if (codebaseIds.length === 0 && codebaseId) {
    codebaseIds = [codebaseId];
  }

  for (const candidateCodebaseId of codebaseIds) {
    await getProjectCodebaseById(sqlite, projectId, candidateCodebaseId);
  }

  codebaseId = codebaseIds[0] ?? null;

  return {
    codebaseId,
    codebaseIds,
    worktreeId,
  };
}

export async function createTask(
  sqlite: Database,
  input: CreateTaskInput,
): Promise<TaskPayload> {
  await getProjectById(sqlite, input.projectId);
  const sessionId = await validateTriggerSession(
    sqlite,
    input.projectId,
    input.sessionId,
  );
  const assignment = await resolveTaskAssignment(sqlite, {
    assignedRole: input.assignedRole,
    assignedSpecialistId: input.assignedSpecialistId,
    assignedSpecialistName: input.assignedSpecialistName,
    projectId: input.projectId,
  });
  const parentTaskId = await validateTaskReference(
    sqlite,
    input.projectId,
    input.parentTaskId,
  );
  const executionSessionId = await validateTriggerSession(
    sqlite,
    input.projectId,
    input.executionSessionId,
  );
  const resultSessionId = await validateTriggerSession(
    sqlite,
    input.projectId,
    input.resultSessionId,
  );
  const workspaceBinding = await resolveTaskWorkspaceBinding(
    sqlite,
    input.projectId,
    {
      codebaseId: input.codebaseId,
      codebaseIds: input.codebaseIds,
      worktreeId: input.worktreeId,
    },
  );
  const kind = ensureTaskKind(input.kind, assignment.assignedRole);
  const status = ensureTaskStatus(input.status, 'PENDING');
  const workflowContext = resolveTaskWorkflowContext({
    boardId: input.boardId,
    columnId: input.columnId,
    kind,
    status,
  });
  const position =
    input.position ??
    (workflowContext.boardId && workflowContext.columnId
      ? getNextTaskPosition(
          sqlite,
          input.projectId,
          workflowContext.boardId,
          workflowContext.columnId,
        )
      : null);
  const sessionIds = dedupeStrings(
    input.sessionIds ?? (sessionId ? [sessionId] : []),
  );
  const now = new Date().toISOString();
  const taskId = createTaskId();

  getDrizzleDb(sqlite)
    .insert(projectTasksTable)
    .values({
      acceptanceCriteriaJson: JSON.stringify(input.acceptanceCriteria ?? []),
      assignedProvider: input.assignedProvider ?? null,
      assignedRole: assignment.assignedRole,
      assignedSpecialistId: assignment.assignedSpecialistId,
      assignedSpecialistName: assignment.assignedSpecialistName,
      assignee: input.assignee ?? null,
      boardId: workflowContext.boardId,
      codebaseId: workspaceBinding.codebaseId,
      codebaseIdsJson: JSON.stringify(workspaceBinding.codebaseIds),
      columnId: workflowContext.columnId,
      completionSummary: input.completionSummary ?? null,
      createdAt: now,
      dependenciesJson: JSON.stringify(input.dependencies ?? []),
      deletedAt: null,
      executionSessionId,
      githubId: input.githubId ?? null,
      githubNumber: input.githubNumber ?? null,
      githubRepo: input.githubRepo ?? null,
      githubState: input.githubState ?? null,
      githubSyncedAt: input.githubSyncedAt ?? null,
      githubUrl: input.githubUrl ?? null,
      id: taskId,
      kind,
      labelsJson: JSON.stringify(input.labels ?? []),
      laneHandoffsJson: JSON.stringify(input.laneHandoffs ?? []),
      laneSessionsJson: JSON.stringify(input.laneSessions ?? []),
      lastSyncError: input.lastSyncError ?? null,
      objective: input.objective,
      parallelGroup: input.parallelGroup ?? null,
      parentTaskId,
      position,
      priority: input.priority ?? null,
      projectId: input.projectId,
      resultSessionId,
      scope: input.scope ?? null,
      sessionId,
      sessionIdsJson: JSON.stringify(sessionIds),
      sourceEntryIndex: input.sourceEntryIndex ?? null,
      sourceEventId: input.sourceEventId ?? null,
      sourceType: input.sourceType ?? 'manual',
      status,
      title: input.title,
      triggerSessionId: null,
      updatedAt: now,
      verificationCommandsJson: JSON.stringify(
        input.verificationCommands ?? [],
      ),
      verificationReport: input.verificationReport ?? null,
      verificationVerdict: input.verificationVerdict ?? null,
      workspaceId: input.projectId,
      worktreeId: workspaceBinding.worktreeId,
    })
    .run();

  return getTaskById(sqlite, taskId);
}

export async function listTasks(
  sqlite: Database,
  query: ListTasksQuery,
): Promise<TaskListPayload> {
  const { page, pageSize, projectId, sessionId, status } = query;

  if (projectId) {
    await getProjectById(sqlite, projectId);
  }

  if (sessionId) {
    const session = await getAcpSessionById(sqlite, sessionId);

    if (projectId && session.project.id !== projectId) {
      throwTaskSessionProjectMismatch(projectId, sessionId);
    }
  }

  const offset = (page - 1) * pageSize;
  const filters = [isNull(projectTasksTable.deletedAt)];

  if (projectId) {
    filters.push(eq(projectTasksTable.projectId, projectId));
  }

  if (sessionId) {
    filters.push(eq(projectTasksTable.sessionId, sessionId));
  }

  if (status) {
    filters.push(eq(projectTasksTable.status, status));
  }

  const whereClause = combineFilters(filters);
  const rows = getDrizzleDb(sqlite)
    .select(taskRowSelection)
    .from(projectTasksTable)
    .where(whereClause)
    .orderBy(desc(projectTasksTable.updatedAt), desc(projectTasksTable.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all() as TaskRow[];

  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectTasksTable)
    .where(whereClause)
    .get() as { count: number };

  return {
    items: rows.map(mapTaskRow),
    page,
    pageSize,
    projectId,
    sessionId,
    status,
    total: total.count,
  };
}

export async function getTaskById(
  sqlite: Database,
  taskId: string,
): Promise<TaskPayload> {
  return mapTaskRow(getTaskRow(sqlite, taskId));
}

export async function updateTask(
  sqlite: Database,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskPayload> {
  const current = getTaskRow(sqlite, taskId);
  const currentStatus = ensureTaskStatus(current.status, 'PENDING');
  const sessionId =
    input.sessionId === undefined
      ? current.session_id
      : await validateTriggerSession(
          sqlite,
          current.project_id,
          input.sessionId,
        );
  const triggerSessionId =
    input.triggerSessionId === undefined
      ? current.trigger_session_id
      : await validateTriggerSession(
          sqlite,
          current.project_id,
          input.triggerSessionId,
        );
  const parentTaskId =
    input.parentTaskId === undefined
      ? current.parent_task_id
      : await validateTaskReference(
          sqlite,
          current.project_id,
          input.parentTaskId,
        );
  const executionSessionId =
    input.executionSessionId === undefined
      ? current.execution_session_id
      : await validateTriggerSession(
          sqlite,
          current.project_id,
          input.executionSessionId,
        );
  const resultSessionId =
    input.resultSessionId === undefined
      ? current.result_session_id
      : await validateTriggerSession(
          sqlite,
          current.project_id,
          input.resultSessionId,
        );
  const workspaceBinding = await resolveTaskWorkspaceBinding(
    sqlite,
    current.project_id,
    {
      codebaseId: input.codebaseId,
      codebaseIds: input.codebaseIds,
      worktreeId: input.worktreeId,
    },
    {
      codebaseId: current.codebase_id,
      codebaseIds: dedupeStrings([
        ...parseStringArray(current.codebase_ids_json),
        ...(current.codebase_id ? [current.codebase_id] : []),
      ]),
      worktreeId: current.worktree_id,
    },
  );
  const assignment = await resolveTaskAssignment(sqlite, {
    assignedRole:
      input.assignedRole === undefined
        ? current.assigned_role
        : input.assignedRole,
    assignedSpecialistId:
      input.assignedSpecialistId === undefined
        ? current.assigned_specialist_id
        : input.assignedSpecialistId,
    assignedSpecialistName:
      input.assignedSpecialistId === null &&
      input.assignedSpecialistName === undefined
        ? null
        : input.assignedSpecialistName === undefined
          ? current.assigned_specialist_name
          : input.assignedSpecialistName,
    projectId: current.project_id,
  });

  if (parentTaskId === taskId) {
    throwTaskParentSelfReference(taskId);
  }

  const kind = ensureTaskKind(
    input.kind === undefined ? current.kind : input.kind,
    assignment.assignedRole,
  );
  const status = ensureTaskStatus(input.status, currentStatus);
  const preservesWorkflowColumn =
    input.boardId === undefined &&
    input.columnId === undefined &&
    input.kind === undefined &&
    input.status === undefined;
  const workflowContext = resolveTaskWorkflowContext({
    boardId: input.boardId === undefined ? current.board_id : input.boardId,
    columnId: preservesWorkflowColumn ? current.column_id : input.columnId,
    kind,
    status,
  });
  const movedToNextColumn =
    current.board_id !== workflowContext.boardId ||
    current.column_id !== workflowContext.columnId;
  const position =
    input.position !== undefined
      ? input.position
      : workflowContext.boardId && workflowContext.columnId
        ? movedToNextColumn
          ? getNextTaskPosition(
              sqlite,
              current.project_id,
              workflowContext.boardId,
              workflowContext.columnId,
              taskId,
            )
          : current.position
        : null;
  const nextSessionIds = dedupeStrings([
    ...(input.sessionIds ?? parseStringArray(current.session_ids_json)),
    ...(sessionId ? [sessionId] : []),
    ...(triggerSessionId ? [triggerSessionId] : []),
  ]);

  const next = {
    acceptanceCriteriaJson:
      input.acceptanceCriteria === undefined
        ? current.acceptance_criteria_json
        : JSON.stringify(input.acceptanceCriteria),
    assignedProvider:
      input.assignedProvider === undefined
        ? current.assigned_provider
        : input.assignedProvider,
    assignedRole: assignment.assignedRole,
    assignedSpecialistId: assignment.assignedSpecialistId,
    assignedSpecialistName: assignment.assignedSpecialistName,
    assignee: input.assignee === undefined ? current.assignee : input.assignee,
    boardId: workflowContext.boardId,
    codebaseId: workspaceBinding.codebaseId,
    columnId: workflowContext.columnId,
    completionSummary:
      input.completionSummary === undefined
        ? current.completion_summary
        : input.completionSummary,
    dependenciesJson:
      input.dependencies === undefined
        ? current.dependencies_json
        : JSON.stringify(input.dependencies),
    githubId: input.githubId === undefined ? current.github_id : input.githubId,
    githubNumber:
      input.githubNumber === undefined
        ? current.github_number
        : input.githubNumber,
    githubRepo:
      input.githubRepo === undefined ? current.github_repo : input.githubRepo,
    githubState:
      input.githubState === undefined
        ? current.github_state
        : input.githubState,
    githubSyncedAt:
      input.githubSyncedAt === undefined
        ? current.github_synced_at
        : input.githubSyncedAt,
    githubUrl:
      input.githubUrl === undefined ? current.github_url : input.githubUrl,
    id: taskId,
    kind,
    labelsJson:
      input.labels === undefined
        ? current.labels_json
        : JSON.stringify(input.labels),
    lastSyncError:
      input.lastSyncError === undefined
        ? current.last_sync_error
        : input.lastSyncError,
    objective: input.objective ?? current.objective,
    executionSessionId,
    laneHandoffsJson:
      input.laneHandoffs === undefined
        ? current.lane_handoffs_json
        : JSON.stringify(input.laneHandoffs),
    laneSessionsJson:
      input.laneSessions === undefined
        ? current.lane_sessions_json
        : JSON.stringify(input.laneSessions),
    parallelGroup:
      input.parallelGroup === undefined
        ? current.parallel_group
        : input.parallelGroup,
    parentTaskId,
    position,
    priority: input.priority === undefined ? current.priority : input.priority,
    scope: input.scope === undefined ? current.scope : input.scope,
    resultSessionId,
    sessionIdsJson: JSON.stringify(nextSessionIds),
    sessionId,
    sourceEntryIndex:
      input.sourceEntryIndex === undefined
        ? current.source_entry_index
        : input.sourceEntryIndex,
    sourceEventId:
      input.sourceEventId === undefined
        ? current.source_event_id
        : input.sourceEventId,
    sourceType:
      input.sourceType === undefined
        ? current.source_type
        : input.sourceType ?? 'manual',
    status,
    title: input.title ?? current.title,
    triggerSessionId,
    updatedAt: nextUpdatedAt(current.updated_at),
    verificationCommandsJson:
      input.verificationCommands === undefined
        ? current.verification_commands_json
        : JSON.stringify(input.verificationCommands),
    verificationReport:
      input.verificationReport === undefined
        ? current.verification_report
        : input.verificationReport,
    verificationVerdict:
      input.verificationVerdict === undefined
        ? current.verification_verdict
        : input.verificationVerdict,
    workspaceId: current.workspace_id ?? current.project_id,
    codebaseIdsJson: JSON.stringify(workspaceBinding.codebaseIds),
    worktreeId: workspaceBinding.worktreeId,
  };

  getDrizzleDb(sqlite)
    .update(projectTasksTable)
    .set({
      acceptanceCriteriaJson: next.acceptanceCriteriaJson,
      assignedProvider: next.assignedProvider,
      assignedRole: next.assignedRole,
      assignedSpecialistId: next.assignedSpecialistId,
      assignedSpecialistName: next.assignedSpecialistName,
      assignee: next.assignee,
      boardId: next.boardId,
      codebaseId: next.codebaseId,
      codebaseIdsJson: next.codebaseIdsJson,
      columnId: next.columnId,
      completionSummary: next.completionSummary,
      dependenciesJson: next.dependenciesJson,
      executionSessionId: next.executionSessionId,
      githubId: next.githubId,
      githubNumber: next.githubNumber,
      githubRepo: next.githubRepo,
      githubState: next.githubState,
      githubSyncedAt: next.githubSyncedAt,
      githubUrl: next.githubUrl,
      kind: next.kind,
      laneHandoffsJson: next.laneHandoffsJson,
      laneSessionsJson: next.laneSessionsJson,
      labelsJson: next.labelsJson,
      lastSyncError: next.lastSyncError,
      objective: next.objective,
      parallelGroup: next.parallelGroup,
      parentTaskId: next.parentTaskId,
      position: next.position,
      priority: next.priority,
      resultSessionId: next.resultSessionId,
      scope: next.scope,
      sessionId: next.sessionId,
      sessionIdsJson: next.sessionIdsJson,
      sourceEntryIndex: next.sourceEntryIndex,
      sourceEventId: next.sourceEventId,
      sourceType: next.sourceType,
      status: next.status,
      title: next.title,
      triggerSessionId: next.triggerSessionId,
      updatedAt: next.updatedAt,
      verificationCommandsJson: next.verificationCommandsJson,
      verificationReport: next.verificationReport,
      verificationVerdict: next.verificationVerdict,
      workspaceId: next.workspaceId,
      worktreeId: next.worktreeId,
    })
    .where(
      and(
        eq(projectTasksTable.id, next.id),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .run();

  return getTaskById(sqlite, taskId);
}

export async function updateTaskFromMcp(
  sqlite: Database,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskPayload> {
  const current = getTaskRow(sqlite, taskId);
  const currentStatus = ensureTaskStatus(current.status, 'PENDING');

  if (input.status !== undefined) {
    ensureTaskStatusWritableViaMcp(
      taskId,
      currentStatus,
      ensureTaskStatus(input.status, currentStatus),
    );
  }

  return updateTask(sqlite, taskId, input);
}

export async function deleteTask(
  sqlite: Database,
  taskId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const result = getDrizzleDb(sqlite)
    .update(projectTasksTable)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectTasksTable.id, taskId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .run();

  if (result.changes === 0) {
    throwTaskNotFound(taskId);
  }
}

export async function listDependentTasks(
  sqlite: Database,
  taskId: string,
): Promise<TaskPayload[]> {
  const rows = getDrizzleDb(sqlite)
    .select({
      id: projectTasksTable.id,
    })
    .from(projectTasksTable)
    .where(
      and(
        isNull(projectTasksTable.deletedAt),
        sql`exists (
          select 1
          from json_each(${projectTasksTable.dependenciesJson})
          where json_each.value = ${taskId}
        )`,
      ),
    )
    .orderBy(asc(projectTasksTable.createdAt), asc(projectTasksTable.updatedAt))
    .all() as DependentTaskRow[];

  return await Promise.all(rows.map((row) => getTaskById(sqlite, row.id)));
}
