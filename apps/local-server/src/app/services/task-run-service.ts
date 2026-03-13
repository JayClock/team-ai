import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CancelTaskRunInput,
  CompleteTaskRunInput,
  CreateTaskRunInput,
  FailTaskRunInput,
  StartTaskRunInput,
  TaskRunKind,
  TaskRunListPayload,
  TaskRunPayload,
  TaskRunStartStatus,
  TaskRunStatus,
  UpdateTaskRunInput,
} from '../schemas/task-run';
import { getProjectById } from './project-service';
import { getTaskById } from './task-service';

const taskRunIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface TaskRunRow {
  completed_at: string | null;
  created_at: string;
  id: string;
  kind: TaskRunKind;
  project_id: string;
  provider: string | null;
  retry_of_run_id: string | null;
  role: string | null;
  session_id: string | null;
  specialist_id: string | null;
  started_at: string | null;
  status: TaskRunStatus;
  summary: string | null;
  task_id: string;
  updated_at: string;
  verification_report: string | null;
  verification_verdict: string | null;
}

interface TaskRunSessionRow {
  id: string;
  project_id: string;
}

interface ListTaskRunsQuery {
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  status?: TaskRunStatus;
  taskId?: string;
}

const taskRunKindValues = ['implement', 'review', 'verify'] as const;
const taskRunStatusValues = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
const taskRunStartStatusValues = ['PENDING', 'RUNNING'] as const;

function createTaskRunId() {
  return `trun_${taskRunIdGenerator()}`;
}

function mapTaskRunRow(row: TaskRunRow): TaskRunPayload {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    projectId: row.project_id,
    provider: row.provider,
    retryOfRunId: row.retry_of_run_id,
    role: row.role,
    sessionId: row.session_id,
    specialistId: row.specialist_id,
    startedAt: row.started_at,
    status: row.status,
    summary: row.summary,
    taskId: row.task_id,
    updatedAt: row.updated_at,
    verificationReport: row.verification_report,
    verificationVerdict: row.verification_verdict,
  };
}

function throwTaskRunNotFound(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-not-found',
    title: 'Task Run Not Found',
    status: 404,
    detail: `Task run ${taskRunId} was not found`,
  });
}

function throwTaskRunProjectMismatch(
  projectId: string,
  taskRunId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-project-mismatch',
    title: 'Task Run Project Mismatch',
    status: 409,
    detail: `Task run ${taskRunId} does not belong to project ${projectId}`,
  });
}

function throwTaskRunSessionProjectMismatch(
  projectId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-session-project-mismatch',
    title: 'Task Run Session Project Mismatch',
    status: 409,
    detail: `Task run project ${projectId} does not match session ${sessionId}`,
  });
}

function throwTaskRunRetryProjectMismatch(
  projectId: string,
  taskRunId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-project-mismatch',
    title: 'Task Run Retry Project Mismatch',
    status: 409,
    detail: `Task run project ${projectId} does not match retry run ${taskRunId}`,
  });
}

function throwTaskRunRetryTaskMismatch(
  taskId: string,
  taskRunId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-task-mismatch',
    title: 'Task Run Retry Task Mismatch',
    status: 409,
    detail: `Task run ${taskRunId} does not belong to task ${taskId}`,
  });
}

function throwTaskRunRetrySelfReference(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-self-reference',
    title: 'Task Run Retry Self Reference',
    status: 409,
    detail: `Task run ${taskRunId} cannot retry itself`,
  });
}

function throwInvalidTaskRunKind(kind: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-task-run-kind',
    title: 'Invalid Task Run Kind',
    status: 400,
    detail: `Task run kind ${kind} is not supported`,
  });
}

function throwInvalidTaskRunStatus(status: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-task-run-status',
    title: 'Invalid Task Run Status',
    status: 400,
    detail: `Task run status ${status} is not supported`,
  });
}

function throwInvalidTaskRunStartStatus(status: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-task-run-start-status',
    title: 'Invalid Task Run Start Status',
    status: 400,
    detail: `Task run start status ${status} must be PENDING or RUNNING`,
  });
}

function throwTaskRunSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/acp-session-not-found',
    title: 'ACP Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
  });
}

function isTaskRunKind(value: string): value is TaskRunKind {
  return taskRunKindValues.includes(value as TaskRunKind);
}

function isTaskRunStatus(value: string): value is TaskRunStatus {
  return taskRunStatusValues.includes(value as TaskRunStatus);
}

function isTaskRunStartStatus(value: string): value is TaskRunStartStatus {
  return taskRunStartStatusValues.includes(value as TaskRunStartStatus);
}

function ensureTaskRunKind(
  kind: string | null | undefined,
  fallback: TaskRunKind,
): TaskRunKind {
  if (!kind) {
    return fallback;
  }

  if (!isTaskRunKind(kind)) {
    throwInvalidTaskRunKind(kind);
  }

  return kind;
}

function ensureTaskRunStatus(
  status: string | null | undefined,
  fallback: TaskRunStatus,
): TaskRunStatus {
  if (!status) {
    return fallback;
  }

  if (!isTaskRunStatus(status)) {
    throwInvalidTaskRunStatus(status);
  }

  return status;
}

function ensureTaskRunStartStatus(
  status: string | null | undefined,
  fallback: TaskRunStartStatus,
): TaskRunStartStatus {
  if (!status) {
    return fallback;
  }

  if (!isTaskRunStartStatus(status)) {
    throwInvalidTaskRunStartStatus(status);
  }

  return status;
}

function defaultTaskRunKind(taskKind: string | null | undefined): TaskRunKind {
  switch (taskKind) {
    case 'review':
      return 'review';
    case 'verify':
      return 'verify';
    case 'plan':
    case 'implement':
    default:
      return 'implement';
  }
}

function getTaskRunRow(sqlite: Database, taskRunId: string): TaskRunRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          task_id,
          session_id,
          kind,
          role,
          provider,
          specialist_id,
          status,
          summary,
          verification_verdict,
          verification_report,
          retry_of_run_id,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM project_task_runs
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(taskRunId) as TaskRunRow | undefined;

  if (!row) {
    throwTaskRunNotFound(taskRunId);
  }

  return row;
}

function getTaskRunSessionRow(
  sqlite: Database,
  sessionId: string,
): TaskRunSessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as TaskRunSessionRow | undefined;

  if (!row) {
    throwTaskRunSessionNotFound(sessionId);
  }

  return row;
}

async function ensureTaskProjectMatch(
  sqlite: Database,
  projectId: string,
  taskId: string,
) {
  const task = await getTaskById(sqlite, taskId);

  if (task.projectId !== projectId) {
    throwTaskRunProjectMismatch(projectId, taskId);
  }

  return task;
}

async function ensureSessionProjectMatch(
  sqlite: Database,
  projectId: string,
  sessionId: string | null | undefined,
) {
  if (!sessionId) {
    return null;
  }

  const session = getTaskRunSessionRow(sqlite, sessionId);

  if (session.project_id !== projectId) {
    throwTaskRunSessionProjectMismatch(projectId, sessionId);
  }

  return session.id;
}

function ensureRetryTaskRunMatch(
  sqlite: Database,
  input: {
    projectId: string;
    retryOfRunId: string | null | undefined;
    taskId: string;
    taskRunId?: string;
  },
) {
  if (!input.retryOfRunId) {
    return null;
  }

  if (input.taskRunId && input.retryOfRunId === input.taskRunId) {
    throwTaskRunRetrySelfReference(input.taskRunId);
  }

  const taskRun = getTaskRunRow(sqlite, input.retryOfRunId);

  if (taskRun.project_id !== input.projectId) {
    throwTaskRunRetryProjectMismatch(input.projectId, input.retryOfRunId);
  }

  if (taskRun.task_id !== input.taskId) {
    throwTaskRunRetryTaskMismatch(input.taskId, input.retryOfRunId);
  }

  return taskRun.id;
}

function resolveTaskRunStartStartedAt(
  status: TaskRunStartStatus,
  startedAt: string | null | undefined,
): string | null {
  if (startedAt !== undefined) {
    return startedAt;
  }

  if (status === 'PENDING') {
    return null;
  }

  return new Date().toISOString();
}

function buildResolvedTaskRunInput(
  current: TaskRunRow,
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  input: CompleteTaskRunInput | FailTaskRunInput | CancelTaskRunInput,
): UpdateTaskRunInput {
  return {
    completedAt:
      input.completedAt === undefined
        ? new Date().toISOString()
        : input.completedAt,
    provider: input.provider,
    role: input.role,
    sessionId: input.sessionId,
    specialistId: input.specialistId,
    startedAt:
      input.startedAt === undefined
        ? status === 'CANCELLED'
          ? current.started_at
          : (current.started_at ?? current.created_at)
        : input.startedAt,
    status,
    summary: input.summary,
    verificationReport: input.verificationReport,
    verificationVerdict: input.verificationVerdict,
  };
}

export async function listTaskRuns(
  sqlite: Database,
  query: ListTaskRunsQuery,
): Promise<TaskRunListPayload> {
  const { page, pageSize, projectId, sessionId, status, taskId } = query;
  await getProjectById(sqlite, projectId);

  if (taskId) {
    await ensureTaskProjectMatch(sqlite, projectId, taskId);
  }

  await ensureSessionProjectMatch(sqlite, projectId, sessionId);

  const offset = (page - 1) * pageSize;
  const filters = ['project_id = @projectId', 'deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    limit: pageSize,
    offset,
    projectId,
  };

  if (taskId) {
    filters.push('task_id = @taskId');
    parameters.taskId = taskId;
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
  const items = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          task_id,
          session_id,
          kind,
          role,
          provider,
          specialist_id,
          status,
          summary,
          verification_verdict,
          verification_report,
          retry_of_run_id,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM project_task_runs
        WHERE ${whereClause}
        ORDER BY updated_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as TaskRunRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_task_runs
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

  return {
    items: items.map(mapTaskRunRow),
    page,
    pageSize,
    projectId,
    sessionId,
    status,
    taskId,
    total: total.count,
  };
}

export async function getTaskRunById(
  sqlite: Database,
  taskRunId: string,
): Promise<TaskRunPayload> {
  return mapTaskRunRow(getTaskRunRow(sqlite, taskRunId));
}

export async function createTaskRun(
  sqlite: Database,
  input: CreateTaskRunInput,
): Promise<TaskRunPayload> {
  await getProjectById(sqlite, input.projectId);
  const task = await ensureTaskProjectMatch(
    sqlite,
    input.projectId,
    input.taskId,
  );
  const sessionId = await ensureSessionProjectMatch(
    sqlite,
    input.projectId,
    input.sessionId,
  );
  const retryOfRunId = ensureRetryTaskRunMatch(sqlite, {
    projectId: input.projectId,
    retryOfRunId: input.retryOfRunId,
    taskId: task.id,
  });
  const now = new Date().toISOString();
  const taskRun: TaskRunPayload = {
    completedAt: null,
    createdAt: now,
    id: createTaskRunId(),
    kind: ensureTaskRunKind(input.kind, defaultTaskRunKind(task.kind)),
    projectId: input.projectId,
    provider: input.provider ?? null,
    retryOfRunId,
    role: input.role ?? task.assignedRole ?? null,
    sessionId,
    specialistId: input.specialistId ?? task.assignedSpecialistId ?? null,
    startedAt: input.startedAt ?? null,
    status: ensureTaskRunStatus(input.status, 'PENDING'),
    summary: input.summary ?? null,
    taskId: task.id,
    updatedAt: now,
    verificationReport: input.verificationReport ?? null,
    verificationVerdict: input.verificationVerdict ?? null,
  };

  sqlite
    .prepare(
      `
        INSERT INTO project_task_runs (
          id,
          project_id,
          task_id,
          session_id,
          kind,
          role,
          provider,
          specialist_id,
          status,
          summary,
          verification_verdict,
          verification_report,
          retry_of_run_id,
          started_at,
          completed_at,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @taskId,
          @sessionId,
          @kind,
          @role,
          @provider,
          @specialistId,
          @status,
          @summary,
          @verificationVerdict,
          @verificationReport,
          @retryOfRunId,
          @startedAt,
          @completedAt,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run(taskRun);

  return taskRun;
}

export async function startTaskRun(
  sqlite: Database,
  input: StartTaskRunInput,
): Promise<TaskRunPayload> {
  const status = ensureTaskRunStartStatus(input.status, 'RUNNING');

  return createTaskRun(sqlite, {
    ...input,
    startedAt: resolveTaskRunStartStartedAt(status, input.startedAt),
    status,
  });
}

export async function updateTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: UpdateTaskRunInput,
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);
  const sessionId =
    input.sessionId === undefined
      ? current.session_id
      : await ensureSessionProjectMatch(
          sqlite,
          current.project_id,
          input.sessionId,
        );
  const retryOfRunId =
    input.retryOfRunId === undefined
      ? current.retry_of_run_id
      : ensureRetryTaskRunMatch(sqlite, {
          projectId: current.project_id,
          retryOfRunId: input.retryOfRunId,
          taskId: current.task_id,
          taskRunId: current.id,
        });
  const updated: TaskRunPayload = {
    completedAt:
      input.completedAt === undefined
        ? current.completed_at
        : input.completedAt,
    createdAt: current.created_at,
    id: current.id,
    kind: current.kind,
    projectId: current.project_id,
    provider: input.provider === undefined ? current.provider : input.provider,
    retryOfRunId,
    role: input.role === undefined ? current.role : input.role,
    sessionId,
    specialistId:
      input.specialistId === undefined
        ? current.specialist_id
        : input.specialistId,
    startedAt:
      input.startedAt === undefined ? current.started_at : input.startedAt,
    status: ensureTaskRunStatus(input.status, current.status),
    summary: input.summary === undefined ? current.summary : input.summary,
    taskId: current.task_id,
    updatedAt: new Date().toISOString(),
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
        UPDATE project_task_runs
        SET
          session_id = @sessionId,
          role = @role,
          provider = @provider,
          specialist_id = @specialistId,
          status = @status,
          summary = @summary,
          verification_verdict = @verificationVerdict,
          verification_report = @verificationReport,
          retry_of_run_id = @retryOfRunId,
          started_at = @startedAt,
          completed_at = @completedAt,
          updated_at = @updatedAt
        WHERE id = @id AND deleted_at IS NULL
      `,
    )
    .run(updated);

  return updated;
}

export async function completeTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: CompleteTaskRunInput = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'COMPLETED', input),
  );
}

export async function failTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: FailTaskRunInput = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'FAILED', input),
  );
}

export async function cancelTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: CancelTaskRunInput = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'CANCELLED', input),
  );
}
