import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { logDiagnostic, type DiagnosticLogger } from '../diagnostics';
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
  row_id: number;
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

interface LatestTaskRunRow {
  id: string;
  task_id: string;
}

interface ListTaskRunsQuery {
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  status?: TaskRunStatus;
  taskId?: string;
}

export interface TaskRunMutationOptions {
  logger?: DiagnosticLogger;
  reason?: string | null;
  source?: string;
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
const retryableTaskRunStatuses = new Set<TaskRunStatus>([
  'FAILED',
  'CANCELLED',
]);

export const MAX_TASK_RUN_RETRY_COUNT = 3;

function createTaskRunId() {
  return `trun_${taskRunIdGenerator()}`;
}

function mapTaskRunRow(
  row: TaskRunRow,
  options: {
    isLatest: boolean;
  },
): TaskRunPayload {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    id: row.id,
    isLatest: options.isLatest,
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
    context: {
      taskRunId,
    },
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
    context: {
      projectId,
      taskRunId,
    },
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
    context: {
      projectId,
      sessionId,
    },
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
    context: {
      projectId,
      taskRunId,
    },
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
    context: {
      taskId,
      taskRunId,
    },
  });
}

function throwTaskRunRetrySelfReference(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-self-reference',
    title: 'Task Run Retry Self Reference',
    status: 409,
    detail: `Task run ${taskRunId} cannot retry itself`,
    context: {
      taskRunId,
    },
  });
}

function throwTaskRunNotRetryable(
  taskRunId: string,
  status: TaskRunStatus,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-not-retryable',
    title: 'Task Run Not Retryable',
    status: 409,
    detail: `Task run ${taskRunId} cannot be retried from status ${status}`,
    context: {
      status,
      taskRunId,
    },
  });
}

function throwTaskRunRetrySourceNotLatest(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-source-not-latest',
    title: 'Task Run Retry Source Not Latest',
    status: 409,
    detail: `Task run ${taskRunId} is no longer the latest run for its task`,
    context: {
      taskRunId,
    },
  });
}

function throwTaskRunRetryLimitExceeded(
  taskId: string,
  maxRetryCount: number,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-limit-exceeded',
    title: 'Task Run Retry Limit Exceeded',
    status: 409,
    detail: `Task ${taskId} reached the maximum retry limit of ${maxRetryCount}`,
    context: {
      maxRetryCount,
      taskId,
    },
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
    context: {
      sessionId,
    },
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
          rowid AS row_id,
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

function getLatestTaskRunRowForTask(
  sqlite: Database,
  taskId: string,
): TaskRunRow | null {
  return (
    (sqlite
      .prepare(
        `
          SELECT
            rowid AS row_id,
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
          WHERE task_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC, row_id DESC
          LIMIT 1
        `,
      )
      .get(taskId) as TaskRunRow | undefined) ?? null
  );
}

function listLatestTaskRunIdsForTaskIds(
  sqlite: Database,
  taskIds: string[],
): Map<string, string> {
  const normalizedTaskIds = [
    ...new Set(taskIds.filter((taskId) => taskId.length > 0)),
  ];

  if (normalizedTaskIds.length === 0) {
    return new Map();
  }

  const placeholders = normalizedTaskIds.map(() => '?').join(', ');
  const rows = sqlite
    .prepare(
      `
        SELECT latest.task_id, latest.id
        FROM project_task_runs AS latest
        WHERE latest.deleted_at IS NULL
          AND latest.task_id IN (${placeholders})
          AND NOT EXISTS (
            SELECT 1
            FROM project_task_runs AS newer
            WHERE newer.task_id = latest.task_id
              AND newer.deleted_at IS NULL
              AND (
                newer.created_at > latest.created_at
                OR (
                  newer.created_at = latest.created_at
                  AND newer.rowid > latest.rowid
                )
              )
          )
      `,
    )
    .all(...normalizedTaskIds) as LatestTaskRunRow[];

  return new Map(rows.map((row) => [row.task_id, row.id]));
}

function getTaskRunRetrySourceRow(
  sqlite: Database,
  taskRunId: string,
): TaskRunRow {
  const taskRun = getTaskRunRow(sqlite, taskRunId);
  const latestTaskRun = getLatestTaskRunRowForTask(sqlite, taskRun.task_id);

  if (!latestTaskRun || latestTaskRun.id !== taskRun.id) {
    throwTaskRunRetrySourceNotLatest(taskRun.id);
  }

  if (!retryableTaskRunStatuses.has(taskRun.status)) {
    throwTaskRunNotRetryable(taskRun.id, taskRun.status);
  }

  return taskRun;
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

function countRetryRunsForTask(sqlite: Database, taskId: string): number {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_task_runs
        WHERE task_id = ?
          AND retry_of_run_id IS NOT NULL
          AND deleted_at IS NULL
      `,
    )
    .get(taskId) as { count: number };

  return row.count;
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

function resolveTaskRunTransitionLogLevel(
  nextStatus: TaskRunStatus | null,
): 'info' | 'warn' {
  return nextStatus === 'FAILED' ? 'warn' : 'info';
}

function logTaskRunTransition(
  logger: DiagnosticLogger | undefined,
  input: {
    nextStatus: TaskRunStatus | null;
    previousStatus: TaskRunStatus | null;
    reason?: string | null;
    source?: string;
    taskRun: Pick<
      TaskRunPayload,
      | 'id'
      | 'kind'
      | 'projectId'
      | 'provider'
      | 'retryOfRunId'
      | 'role'
      | 'sessionId'
      | 'specialistId'
      | 'status'
      | 'taskId'
      | 'verificationVerdict'
    >;
  },
) {
  logDiagnostic(
    logger,
    resolveTaskRunTransitionLogLevel(input.nextStatus),
    {
      event: 'task.run.transition',
      kind: input.taskRun.kind,
      nextStatus: input.nextStatus,
      previousStatus: input.previousStatus,
      projectId: input.taskRun.projectId,
      provider: input.taskRun.provider,
      reason: input.reason ?? null,
      retryOfRunId: input.taskRun.retryOfRunId,
      role: input.taskRun.role,
      sessionId: input.taskRun.sessionId,
      source: input.source ?? 'task-run-service',
      specialistId: input.taskRun.specialistId,
      taskId: input.taskRun.taskId,
      taskRunId: input.taskRun.id,
      verificationVerdict: input.taskRun.verificationVerdict,
    },
    'Task run state changed',
  );
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
          rowid AS row_id,
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
  const latestTaskRunIdByTaskId = listLatestTaskRunIdsForTaskIds(
    sqlite,
    items.map((item) => item.task_id),
  );

  return {
    items: items.map((item) =>
      mapTaskRunRow(item, {
        isLatest: latestTaskRunIdByTaskId.get(item.task_id) === item.id,
      }),
    ),
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
  const taskRun = getTaskRunRow(sqlite, taskRunId);
  const latestTaskRun = getLatestTaskRunRowForTask(sqlite, taskRun.task_id);

  return mapTaskRunRow(taskRun, {
    isLatest: latestTaskRun?.id === taskRun.id,
  });
}

export async function getLatestTaskRunByTaskId(
  sqlite: Database,
  taskId: string,
): Promise<TaskRunPayload | null> {
  const taskRun = getLatestTaskRunRowForTask(sqlite, taskId);

  if (!taskRun) {
    return null;
  }

  return mapTaskRunRow(taskRun, {
    isLatest: true,
  });
}

export async function getRetryableTaskRunById(
  sqlite: Database,
  taskRunId: string,
): Promise<TaskRunPayload> {
  const taskRun = getTaskRunRetrySourceRow(sqlite, taskRunId);

  return mapTaskRunRow(taskRun, {
    isLatest: true,
  });
}

export async function resolveLatestRetrySourceRunId(
  sqlite: Database,
  taskId: string,
): Promise<string | null> {
  const taskRun = getLatestTaskRunRowForTask(sqlite, taskId);

  if (!taskRun || !retryableTaskRunStatuses.has(taskRun.status)) {
    return null;
  }

  return taskRun.id;
}

export async function resolveRetryDispatchRunId(
  sqlite: Database,
  input: {
    maxRetryCount?: number;
    retryOfRunId?: string | null;
    taskId: string;
  },
): Promise<string | null> {
  const sourceRun = input.retryOfRunId
    ? getTaskRunRetrySourceRow(sqlite, input.retryOfRunId)
    : getLatestTaskRunRowForTask(sqlite, input.taskId);

  if (!sourceRun) {
    return null;
  }

  if (sourceRun.task_id !== input.taskId) {
    throwTaskRunRetryTaskMismatch(input.taskId, sourceRun.id);
  }

  if (!retryableTaskRunStatuses.has(sourceRun.status)) {
    return null;
  }

  const maxRetryCount = input.maxRetryCount ?? MAX_TASK_RUN_RETRY_COUNT;
  const retryCount = countRetryRunsForTask(sqlite, input.taskId);

  if (retryCount >= maxRetryCount) {
    throwTaskRunRetryLimitExceeded(input.taskId, maxRetryCount);
  }

  return sourceRun.id;
}

export async function createTaskRun(
  sqlite: Database,
  input: CreateTaskRunInput,
  options: TaskRunMutationOptions = {},
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
  const taskRun = {
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

  const createdTaskRun = await getTaskRunById(sqlite, taskRun.id);
  logTaskRunTransition(options.logger, {
    nextStatus: createdTaskRun.status,
    previousStatus: null,
    reason: options.reason ?? 'created',
    source: options.source,
    taskRun: createdTaskRun,
  });

  return createdTaskRun;
}

export async function startTaskRun(
  sqlite: Database,
  input: StartTaskRunInput,
  options: TaskRunMutationOptions = {},
): Promise<TaskRunPayload> {
  const status = ensureTaskRunStartStatus(input.status, 'RUNNING');

  return createTaskRun(
    sqlite,
    {
      ...input,
      startedAt: resolveTaskRunStartStartedAt(status, input.startedAt),
      status,
    },
    {
      ...options,
      reason: options.reason ?? 'started',
    },
  );
}

export async function updateTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: UpdateTaskRunInput,
  options: TaskRunMutationOptions = {},
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
  const updated = {
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

  const updatedTaskRun = await getTaskRunById(sqlite, taskRunId);

  if (current.status !== updatedTaskRun.status) {
    logTaskRunTransition(options.logger, {
      nextStatus: updatedTaskRun.status,
      previousStatus: current.status,
      reason: options.reason ?? 'updated',
      source: options.source,
      taskRun: updatedTaskRun,
    });
  }

  return updatedTaskRun;
}

export async function completeTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: CompleteTaskRunInput = {},
  options: TaskRunMutationOptions = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'COMPLETED', input),
    {
      ...options,
      reason: options.reason ?? 'completed',
    },
  );
}

export async function failTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: FailTaskRunInput = {},
  options: TaskRunMutationOptions = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'FAILED', input),
    {
      ...options,
      reason: options.reason ?? 'failed',
    },
  );
}

export async function cancelTaskRun(
  sqlite: Database,
  taskRunId: string,
  input: CancelTaskRunInput = {},
  options: TaskRunMutationOptions = {},
): Promise<TaskRunPayload> {
  const current = getTaskRunRow(sqlite, taskRunId);

  return updateTaskRun(
    sqlite,
    taskRunId,
    buildResolvedTaskRunInput(current, 'CANCELLED', input),
    {
      ...options,
      reason: options.reason ?? 'cancelled',
    },
  );
}
