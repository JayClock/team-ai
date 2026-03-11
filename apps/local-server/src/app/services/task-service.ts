import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CreateTaskInput,
  TaskListPayload,
  TaskPayload,
  UpdateTaskInput,
} from '../schemas/task';
import { getProjectById } from './project-service';
import { getSessionById } from './session-service';
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
  labels_json: string;
  last_sync_error: string | null;
  objective: string;
  parallel_group: string | null;
  position: number | null;
  priority: string | null;
  project_id: string;
  scope: string | null;
  status: string;
  title: string;
  trigger_session_id: string | null;
  updated_at: string;
  verification_commands_json: string;
  verification_report: string | null;
  verification_verdict: string | null;
}

interface ListTasksQuery {
  page: number;
  pageSize: number;
  projectId?: string;
  sessionId?: string;
  status?: string;
}

function createTaskId() {
  return `task_${taskIdGenerator()}`;
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
    labels: parseStringArray(row.labels_json),
    lastSyncError: row.last_sync_error,
    objective: row.objective,
    parallelGroup: row.parallel_group,
    position: row.position,
    priority: row.priority,
    projectId: row.project_id,
    scope: row.scope,
    status: row.status,
    title: row.title,
    triggerSessionId: row.trigger_session_id,
    updatedAt: row.updated_at,
    verificationCommands: parseStringArray(row.verification_commands_json),
    verificationReport: row.verification_report,
    verificationVerdict: row.verification_verdict,
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
    throwSpecialistRoleMismatch(
      specialist.id,
      assignedRole,
      specialist.role,
    );
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

  const session = await getSessionById(sqlite, sessionId);

  if (session.projectId !== projectId) {
    throwTaskSessionProjectMismatch(projectId, sessionId);
  }

  return sessionId;
}

export async function createTask(
  sqlite: Database,
  input: CreateTaskInput,
): Promise<TaskPayload> {
  await getProjectById(sqlite, input.projectId);
  const triggerSessionId = await validateTriggerSession(
    sqlite,
    input.projectId,
    input.triggerSessionId,
  );
  const assignment = await resolveTaskAssignment(sqlite, {
    assignedRole: input.assignedRole,
    assignedSpecialistId: input.assignedSpecialistId,
    assignedSpecialistName: input.assignedSpecialistName,
    projectId: input.projectId,
  });
  const now = new Date().toISOString();
  const taskId = createTaskId();

  sqlite
    .prepare(
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
      labelsJson: JSON.stringify(input.labels ?? []),
      lastSyncError: input.lastSyncError ?? null,
      objective: input.objective,
      parallelGroup: input.parallelGroup ?? null,
      position: input.position ?? null,
      priority: input.priority ?? null,
      projectId: input.projectId,
      scope: input.scope ?? null,
      status: input.status ?? 'PENDING',
      title: input.title,
      triggerSessionId,
      updatedAt: now,
      verificationCommandsJson: JSON.stringify(input.verificationCommands ?? []),
      verificationReport: input.verificationReport ?? null,
      verificationVerdict: input.verificationVerdict ?? null,
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
    await getSessionById(sqlite, sessionId);
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
    filters.push('trigger_session_id = @sessionId');
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
  const triggerSessionId =
    input.triggerSessionId === undefined
      ? current.trigger_session_id
      : await validateTriggerSession(
          sqlite,
          current.project_id,
          input.triggerSessionId,
        );
  const assignment = await resolveTaskAssignment(sqlite, {
    assignedRole:
      input.assignedRole === undefined ? current.assigned_role : input.assignedRole,
    assignedSpecialistId:
      input.assignedSpecialistId === undefined
        ? current.assigned_specialist_id
        : input.assignedSpecialistId,
    assignedSpecialistName:
      input.assignedSpecialistId === null && input.assignedSpecialistName === undefined
        ? null
        : input.assignedSpecialistName === undefined
          ? current.assigned_specialist_name
          : input.assignedSpecialistName,
    projectId: current.project_id,
  });

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
      input.githubNumber === undefined ? current.github_number : input.githubNumber,
    githubRepo:
      input.githubRepo === undefined ? current.github_repo : input.githubRepo,
    githubState:
      input.githubState === undefined ? current.github_state : input.githubState,
    githubSyncedAt:
      input.githubSyncedAt === undefined
        ? current.github_synced_at
        : input.githubSyncedAt,
    githubUrl: input.githubUrl === undefined ? current.github_url : input.githubUrl,
    id: taskId,
    labelsJson:
      input.labels === undefined ? current.labels_json : JSON.stringify(input.labels),
    lastSyncError:
      input.lastSyncError === undefined
        ? current.last_sync_error
        : input.lastSyncError,
    objective: input.objective ?? current.objective,
    parallelGroup:
      input.parallelGroup === undefined
        ? current.parallel_group
        : input.parallelGroup,
    position: input.position === undefined ? current.position : input.position,
    priority: input.priority === undefined ? current.priority : input.priority,
    scope: input.scope === undefined ? current.scope : input.scope,
    status: input.status ?? current.status,
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
  };

  sqlite
    .prepare(
      `
        UPDATE project_tasks
        SET
          trigger_session_id = @triggerSessionId,
          title = @title,
          objective = @objective,
          scope = @scope,
          status = @status,
          board_id = @boardId,
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
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(next);

  return getTaskById(sqlite, taskId);
}

export async function deleteTask(sqlite: Database, taskId: string): Promise<void> {
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
