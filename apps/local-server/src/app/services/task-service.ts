import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CreateTaskInput,
  TaskKind,
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
  worktree_id: string | null;
}

interface ListTasksQuery {
  page: number;
  pageSize: number;
  projectId?: string;
  sessionId?: string;
  status?: string;
}

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
  const row = sqlite
    .prepare(
      `
        SELECT
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
          session_id,
          codebase_id,
          worktree_id,
          created_at,
          updated_at
        FROM project_tasks
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(taskId) as TaskRow | undefined;

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

  const row = sqlite
    .prepare(
      `
        SELECT id, project_id
        FROM project_tasks
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(taskId) as { id: string; project_id: string } | undefined;

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
    worktreeId?: string | null;
  },
  current?: {
    codebaseId: string | null;
    worktreeId: string | null;
  },
) {
  let codebaseId =
    input.codebaseId === undefined
      ? (current?.codebaseId ?? null)
      : input.codebaseId;
  let worktreeId =
    input.worktreeId === undefined
      ? (current?.worktreeId ?? null)
      : input.worktreeId;

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
  }

  if (codebaseId) {
    await getProjectCodebaseById(sqlite, projectId, codebaseId);
  }

  return {
    codebaseId,
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
      worktreeId: input.worktreeId,
    },
  );
  const kind = ensureTaskKind(input.kind, assignment.assignedRole);
  const status = ensureTaskStatus(input.status, 'PENDING');
  const now = new Date().toISOString();
  const taskId = createTaskId();

  sqlite
    .prepare(
      `
        INSERT INTO project_tasks (
          id,
          project_id,
          session_id,
          trigger_session_id,
          codebase_id,
          worktree_id,
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
          @sessionId,
          @triggerSessionId,
          @codebaseId,
          @worktreeId,
          @title,
          @objective,
          @scope,
          @status,
          @boardId,
          @columnId,
          @position,
          @priority,
          @labelsJson,
          @assignee,
          @assignedProvider,
          @assignedRole,
          @assignedSpecialistId,
          @assignedSpecialistName,
          @dependenciesJson,
          @parallelGroup,
          @acceptanceCriteriaJson,
          @verificationCommandsJson,
          @completionSummary,
          @verificationVerdict,
          @verificationReport,
          @githubId,
          @githubNumber,
          @githubUrl,
          @githubRepo,
          @githubState,
          @githubSyncedAt,
          @lastSyncError,
          @kind,
          @parentTaskId,
          @executionSessionId,
          @resultSessionId,
          @sourceType,
          @sourceEventId,
          @sourceEntryIndex,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run({
      acceptanceCriteriaJson: JSON.stringify(input.acceptanceCriteria ?? []),
      assignedProvider: input.assignedProvider ?? null,
      assignedRole: assignment.assignedRole,
      assignedSpecialistId: assignment.assignedSpecialistId,
      assignedSpecialistName: assignment.assignedSpecialistName,
      assignee: input.assignee ?? null,
      boardId: input.boardId ?? null,
      codebaseId: workspaceBinding.codebaseId,
      columnId: input.columnId ?? null,
      completionSummary: input.completionSummary ?? null,
      createdAt: now,
      dependenciesJson: JSON.stringify(input.dependencies ?? []),
      githubId: input.githubId ?? null,
      githubNumber: input.githubNumber ?? null,
      githubRepo: input.githubRepo ?? null,
      githubState: input.githubState ?? null,
      githubSyncedAt: input.githubSyncedAt ?? null,
      githubUrl: input.githubUrl ?? null,
      id: taskId,
      kind,
      labelsJson: JSON.stringify(input.labels ?? []),
      lastSyncError: input.lastSyncError ?? null,
      objective: input.objective,
      executionSessionId,
      parallelGroup: input.parallelGroup ?? null,
      parentTaskId,
      position: input.position ?? null,
      priority: input.priority ?? null,
      projectId: input.projectId,
      resultSessionId,
      sessionId,
      scope: input.scope ?? null,
      status,
      sourceEntryIndex: input.sourceEntryIndex ?? null,
      sourceEventId: input.sourceEventId ?? null,
      sourceType: input.sourceType ?? 'manual',
      title: input.title,
      triggerSessionId: null,
      updatedAt: now,
      verificationCommandsJson: JSON.stringify(
        input.verificationCommands ?? [],
      ),
      verificationReport: input.verificationReport ?? null,
      verificationVerdict: input.verificationVerdict ?? null,
      worktreeId: workspaceBinding.worktreeId,
    });

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
  const filters = ['deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    limit: pageSize,
    offset,
  };

  if (projectId) {
    filters.push('project_id = @projectId');
    parameters.projectId = projectId;
  }

  if (sessionId) {
    filters.push('session_id = @sessionId');
    parameters.sessionId = sessionId;
  }

  if (status) {
    filters.push('status = @status');
    parameters.status = status;
  }

  const whereClause = filters.join(' AND ');

  const rows = sqlite
    .prepare(
      `
        SELECT
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
          session_id,
          codebase_id,
          worktree_id,
          created_at,
          updated_at
        FROM project_tasks
        WHERE ${whereClause}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as TaskRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_tasks
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

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
      worktreeId: input.worktreeId,
    },
    {
      codebaseId: current.codebase_id,
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
    boardId: input.boardId === undefined ? current.board_id : input.boardId,
    codebaseId: workspaceBinding.codebaseId,
    columnId: input.columnId === undefined ? current.column_id : input.columnId,
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
    parallelGroup:
      input.parallelGroup === undefined
        ? current.parallel_group
        : input.parallelGroup,
    parentTaskId,
    position: input.position === undefined ? current.position : input.position,
    priority: input.priority === undefined ? current.priority : input.priority,
    scope: input.scope === undefined ? current.scope : input.scope,
    resultSessionId,
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
    status: ensureTaskStatus(input.status, currentStatus),
    title: input.title ?? current.title,
    triggerSessionId,
    updatedAt: new Date().toISOString(),
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
    worktreeId: workspaceBinding.worktreeId,
  };

  sqlite
    .prepare(
      `
        UPDATE project_tasks
        SET
          session_id = @sessionId,
          trigger_session_id = @triggerSessionId,
          title = @title,
          objective = @objective,
          scope = @scope,
          status = @status,
          board_id = @boardId,
          codebase_id = @codebaseId,
          column_id = @columnId,
          position = @position,
          priority = @priority,
          labels_json = @labelsJson,
          assignee = @assignee,
          assigned_provider = @assignedProvider,
          assigned_role = @assignedRole,
          assigned_specialist_id = @assignedSpecialistId,
          assigned_specialist_name = @assignedSpecialistName,
          dependencies_json = @dependenciesJson,
          parallel_group = @parallelGroup,
          acceptance_criteria_json = @acceptanceCriteriaJson,
          verification_commands_json = @verificationCommandsJson,
          completion_summary = @completionSummary,
          verification_verdict = @verificationVerdict,
          verification_report = @verificationReport,
          github_id = @githubId,
          github_number = @githubNumber,
          github_url = @githubUrl,
          github_repo = @githubRepo,
          github_state = @githubState,
          github_synced_at = @githubSyncedAt,
          last_sync_error = @lastSyncError,
          kind = @kind,
          parent_task_id = @parentTaskId,
          execution_session_id = @executionSessionId,
          result_session_id = @resultSessionId,
          source_type = @sourceType,
          source_event_id = @sourceEventId,
          source_entry_index = @sourceEntryIndex,
          worktree_id = @worktreeId,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

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
  const result = sqlite
    .prepare(
      `
        UPDATE project_tasks
        SET
          deleted_at = @deletedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run({
      deletedAt: new Date().toISOString(),
      id: taskId,
      updatedAt: new Date().toISOString(),
    });

  if (result.changes === 0) {
    throwTaskNotFound(taskId);
  }
}
