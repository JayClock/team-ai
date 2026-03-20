import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectBackgroundTasksTable } from '../db/schema';
import type {
  BackgroundTaskListPayload,
  BackgroundTaskPayload,
  BackgroundTaskStatus,
  CreateBackgroundTaskInput,
} from '../schemas/background-task';
import { getProjectById } from './project-service';

const backgroundTaskIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface BackgroundTaskRow {
  agent_id: string;
  attempts: number;
  completed_at: string | null;
  created_at: string;
  current_activity: string | null;
  depends_on_task_ids_json: string;
  error_message: string | null;
  id: string;
  input_tokens: number | null;
  last_activity_at: string | null;
  max_attempts: number;
  output_tokens: number | null;
  priority: string;
  project_id: string;
  prompt: string;
  result_session_id: string | null;
  specialist_id: string | null;
  started_at: string | null;
  status: string;
  task_id: string | null;
  task_output: string | null;
  title: string;
  tool_call_count: number | null;
  trigger_source: string;
  triggered_by: string;
  updated_at: string;
  workflow_run_id: string | null;
  workflow_step_name: string | null;
}

interface ListBackgroundTasksQuery {
  page: number;
  pageSize: number;
  projectId: string;
  status?: BackgroundTaskStatus;
}

const backgroundTaskStatusValues = new Set<BackgroundTaskStatus>([
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'PENDING',
  'RUNNING',
]);

function createBackgroundTaskId() {
  return `bgt_${backgroundTaskIdGenerator()}`;
}

function mapBackgroundTaskRow(row: BackgroundTaskRow): BackgroundTaskPayload {
  return {
    agentId: row.agent_id,
    attempts: row.attempts,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    currentActivity: row.current_activity,
    dependsOnTaskIds: JSON.parse(row.depends_on_task_ids_json) as string[],
    errorMessage: row.error_message,
    id: row.id,
    inputTokens: row.input_tokens,
    lastActivityAt: row.last_activity_at,
    maxAttempts: row.max_attempts,
    outputTokens: row.output_tokens,
    priority: row.priority as BackgroundTaskPayload['priority'],
    projectId: row.project_id,
    prompt: row.prompt,
    resultSessionId: row.result_session_id,
    specialistId: row.specialist_id,
    startedAt: row.started_at,
    status: row.status as BackgroundTaskPayload['status'],
    taskId: row.task_id,
    taskOutput: row.task_output,
    title: row.title,
    toolCallCount: row.tool_call_count,
    triggerSource: row.trigger_source as BackgroundTaskPayload['triggerSource'],
    triggeredBy: row.triggered_by,
    updatedAt: row.updated_at,
    workflowRunId: row.workflow_run_id,
    workflowStepName: row.workflow_step_name,
  };
}

function throwBackgroundTaskNotFound(backgroundTaskId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/background-task-not-found',
    title: 'Background Task Not Found',
    status: 404,
    detail: `Background task ${backgroundTaskId} was not found`,
  });
}

function throwInvalidBackgroundTaskStatus(status: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/invalid-background-task-status',
    title: 'Invalid Background Task Status',
    status: 400,
    detail: `Background task status ${status} is not supported`,
  });
}

function ensureBackgroundTaskStatus(
  status: string | undefined,
): BackgroundTaskStatus | undefined {
  if (status === undefined) {
    return undefined;
  }

  if (!backgroundTaskStatusValues.has(status as BackgroundTaskStatus)) {
    throwInvalidBackgroundTaskStatus(status);
  }

  return status as BackgroundTaskStatus;
}

function getBackgroundTaskRow(
  sqlite: Database,
  backgroundTaskId: string,
): BackgroundTaskRow {
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectBackgroundTasksTable.id,
      project_id: projectBackgroundTasksTable.projectId,
      task_id: projectBackgroundTasksTable.taskId,
      title: projectBackgroundTasksTable.title,
      prompt: projectBackgroundTasksTable.prompt,
      agent_id: projectBackgroundTasksTable.agentId,
      status: projectBackgroundTasksTable.status,
      triggered_by: projectBackgroundTasksTable.triggeredBy,
      trigger_source: projectBackgroundTasksTable.triggerSource,
      priority: projectBackgroundTasksTable.priority,
      result_session_id: projectBackgroundTasksTable.resultSessionId,
      error_message: projectBackgroundTasksTable.errorMessage,
      attempts: projectBackgroundTasksTable.attempts,
      max_attempts: projectBackgroundTasksTable.maxAttempts,
      last_activity_at: projectBackgroundTasksTable.lastActivityAt,
      current_activity: projectBackgroundTasksTable.currentActivity,
      tool_call_count: projectBackgroundTasksTable.toolCallCount,
      input_tokens: projectBackgroundTasksTable.inputTokens,
      output_tokens: projectBackgroundTasksTable.outputTokens,
      workflow_run_id: projectBackgroundTasksTable.workflowRunId,
      workflow_step_name: projectBackgroundTasksTable.workflowStepName,
      specialist_id: projectBackgroundTasksTable.specialistId,
      depends_on_task_ids_json: projectBackgroundTasksTable.dependsOnTaskIdsJson,
      task_output: projectBackgroundTasksTable.taskOutput,
      started_at: projectBackgroundTasksTable.startedAt,
      completed_at: projectBackgroundTasksTable.completedAt,
      created_at: projectBackgroundTasksTable.createdAt,
      updated_at: projectBackgroundTasksTable.updatedAt,
    })
    .from(projectBackgroundTasksTable)
    .where(
      and(
        eq(projectBackgroundTasksTable.id, backgroundTaskId),
        isNull(projectBackgroundTasksTable.deletedAt),
      ),
    )
    .get() as BackgroundTaskRow | undefined;

  if (!row) {
    throwBackgroundTaskNotFound(backgroundTaskId);
  }

  return row;
}

export async function createBackgroundTask(
  sqlite: Database,
  input: CreateBackgroundTaskInput,
): Promise<BackgroundTaskPayload> {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const title = input.title?.trim() || input.prompt.trim().slice(0, 60);
  const id = createBackgroundTaskId();

  getDrizzleDb(sqlite)
    .insert(projectBackgroundTasksTable)
    .values({
      id,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      title,
      prompt: input.prompt,
      agentId: input.agentId,
      status: 'PENDING',
      triggeredBy: input.triggeredBy ?? 'user',
      triggerSource: input.triggerSource ?? 'manual',
      priority: input.priority ?? 'NORMAL',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 1,
      workflowRunId: input.workflowRunId ?? null,
      workflowStepName: input.workflowStepName ?? null,
      specialistId: input.specialistId ?? null,
      dependsOnTaskIdsJson: JSON.stringify(input.dependsOnTaskIds ?? []),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getBackgroundTaskById(sqlite, id);
}

export async function listBackgroundTasks(
  sqlite: Database,
  query: ListBackgroundTasksQuery,
): Promise<BackgroundTaskListPayload> {
  await getProjectById(sqlite, query.projectId);
  const offset = (query.page - 1) * query.pageSize;
  const normalizedStatus = ensureBackgroundTaskStatus(query.status);
  const whereClause = and(
    eq(projectBackgroundTasksTable.projectId, query.projectId),
    isNull(projectBackgroundTasksTable.deletedAt),
    normalizedStatus ? eq(projectBackgroundTasksTable.status, normalizedStatus) : undefined,
  );
  const db = getDrizzleDb(sqlite);
  const items = db
    .select({
      id: projectBackgroundTasksTable.id,
      project_id: projectBackgroundTasksTable.projectId,
      task_id: projectBackgroundTasksTable.taskId,
      title: projectBackgroundTasksTable.title,
      prompt: projectBackgroundTasksTable.prompt,
      agent_id: projectBackgroundTasksTable.agentId,
      status: projectBackgroundTasksTable.status,
      triggered_by: projectBackgroundTasksTable.triggeredBy,
      trigger_source: projectBackgroundTasksTable.triggerSource,
      priority: projectBackgroundTasksTable.priority,
      result_session_id: projectBackgroundTasksTable.resultSessionId,
      error_message: projectBackgroundTasksTable.errorMessage,
      attempts: projectBackgroundTasksTable.attempts,
      max_attempts: projectBackgroundTasksTable.maxAttempts,
      last_activity_at: projectBackgroundTasksTable.lastActivityAt,
      current_activity: projectBackgroundTasksTable.currentActivity,
      tool_call_count: projectBackgroundTasksTable.toolCallCount,
      input_tokens: projectBackgroundTasksTable.inputTokens,
      output_tokens: projectBackgroundTasksTable.outputTokens,
      workflow_run_id: projectBackgroundTasksTable.workflowRunId,
      workflow_step_name: projectBackgroundTasksTable.workflowStepName,
      specialist_id: projectBackgroundTasksTable.specialistId,
      depends_on_task_ids_json: projectBackgroundTasksTable.dependsOnTaskIdsJson,
      task_output: projectBackgroundTasksTable.taskOutput,
      started_at: projectBackgroundTasksTable.startedAt,
      completed_at: projectBackgroundTasksTable.completedAt,
      created_at: projectBackgroundTasksTable.createdAt,
      updated_at: projectBackgroundTasksTable.updatedAt,
    })
    .from(projectBackgroundTasksTable)
    .where(whereClause)
    .orderBy(desc(projectBackgroundTasksTable.updatedAt), desc(projectBackgroundTasksTable.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all() as BackgroundTaskRow[];

  const total = db
    .select({ count: count() })
    .from(projectBackgroundTasksTable)
    .where(whereClause)
    .get() as { count: number };

  return {
    items: items.map(mapBackgroundTaskRow),
    page: query.page,
    pageSize: query.pageSize,
    projectId: query.projectId,
    status: normalizedStatus,
    total: total.count,
  };
}

export async function getBackgroundTaskById(
  sqlite: Database,
  backgroundTaskId: string,
): Promise<BackgroundTaskPayload> {
  return mapBackgroundTaskRow(getBackgroundTaskRow(sqlite, backgroundTaskId));
}

export async function listReadyBackgroundTasks(
  sqlite: Database,
): Promise<BackgroundTaskPayload[]> {
  const rows = getDrizzleDb(sqlite)
    .select({
      id: projectBackgroundTasksTable.id,
      project_id: projectBackgroundTasksTable.projectId,
      task_id: projectBackgroundTasksTable.taskId,
      title: projectBackgroundTasksTable.title,
      prompt: projectBackgroundTasksTable.prompt,
      agent_id: projectBackgroundTasksTable.agentId,
      status: projectBackgroundTasksTable.status,
      triggered_by: projectBackgroundTasksTable.triggeredBy,
      trigger_source: projectBackgroundTasksTable.triggerSource,
      priority: projectBackgroundTasksTable.priority,
      result_session_id: projectBackgroundTasksTable.resultSessionId,
      error_message: projectBackgroundTasksTable.errorMessage,
      attempts: projectBackgroundTasksTable.attempts,
      max_attempts: projectBackgroundTasksTable.maxAttempts,
      last_activity_at: projectBackgroundTasksTable.lastActivityAt,
      current_activity: projectBackgroundTasksTable.currentActivity,
      tool_call_count: projectBackgroundTasksTable.toolCallCount,
      input_tokens: projectBackgroundTasksTable.inputTokens,
      output_tokens: projectBackgroundTasksTable.outputTokens,
      workflow_run_id: projectBackgroundTasksTable.workflowRunId,
      workflow_step_name: projectBackgroundTasksTable.workflowStepName,
      specialist_id: projectBackgroundTasksTable.specialistId,
      depends_on_task_ids_json: projectBackgroundTasksTable.dependsOnTaskIdsJson,
      task_output: projectBackgroundTasksTable.taskOutput,
      started_at: projectBackgroundTasksTable.startedAt,
      completed_at: projectBackgroundTasksTable.completedAt,
      created_at: projectBackgroundTasksTable.createdAt,
      updated_at: projectBackgroundTasksTable.updatedAt,
    })
    .from(projectBackgroundTasksTable)
    .where(
      and(
        eq(projectBackgroundTasksTable.status, 'PENDING'),
        isNull(projectBackgroundTasksTable.deletedAt),
      ),
    )
    .orderBy(
      sql`CASE ${projectBackgroundTasksTable.priority}
            WHEN 'HIGH' THEN 0
            WHEN 'NORMAL' THEN 1
            ELSE 2
          END`,
      asc(projectBackgroundTasksTable.createdAt),
    )
    .all() as BackgroundTaskRow[];

  const tasksById = new Map(rows.map((row) => [row.id, mapBackgroundTaskRow(row)]));

  const dependencies = getDrizzleDb(sqlite)
    .select({
      id: projectBackgroundTasksTable.id,
      status: projectBackgroundTasksTable.status,
    })
    .from(projectBackgroundTasksTable)
    .where(isNull(projectBackgroundTasksTable.deletedAt))
    .all() as Array<{ id: string; status: BackgroundTaskStatus }>;
  const dependencyStatusById = new Map(
    dependencies.map((row) => [row.id, row.status]),
  );

  return Array.from(tasksById.values()).filter((task) =>
    task.dependsOnTaskIds.every(
      (dependencyId) => dependencyStatusById.get(dependencyId) === 'COMPLETED',
    ),
  );
}

export async function listRunningBackgroundTasks(
  sqlite: Database,
): Promise<BackgroundTaskPayload[]> {
  const rows = getDrizzleDb(sqlite)
    .select({
      id: projectBackgroundTasksTable.id,
      project_id: projectBackgroundTasksTable.projectId,
      task_id: projectBackgroundTasksTable.taskId,
      title: projectBackgroundTasksTable.title,
      prompt: projectBackgroundTasksTable.prompt,
      agent_id: projectBackgroundTasksTable.agentId,
      status: projectBackgroundTasksTable.status,
      triggered_by: projectBackgroundTasksTable.triggeredBy,
      trigger_source: projectBackgroundTasksTable.triggerSource,
      priority: projectBackgroundTasksTable.priority,
      result_session_id: projectBackgroundTasksTable.resultSessionId,
      error_message: projectBackgroundTasksTable.errorMessage,
      attempts: projectBackgroundTasksTable.attempts,
      max_attempts: projectBackgroundTasksTable.maxAttempts,
      last_activity_at: projectBackgroundTasksTable.lastActivityAt,
      current_activity: projectBackgroundTasksTable.currentActivity,
      tool_call_count: projectBackgroundTasksTable.toolCallCount,
      input_tokens: projectBackgroundTasksTable.inputTokens,
      output_tokens: projectBackgroundTasksTable.outputTokens,
      workflow_run_id: projectBackgroundTasksTable.workflowRunId,
      workflow_step_name: projectBackgroundTasksTable.workflowStepName,
      specialist_id: projectBackgroundTasksTable.specialistId,
      depends_on_task_ids_json: projectBackgroundTasksTable.dependsOnTaskIdsJson,
      task_output: projectBackgroundTasksTable.taskOutput,
      started_at: projectBackgroundTasksTable.startedAt,
      completed_at: projectBackgroundTasksTable.completedAt,
      created_at: projectBackgroundTasksTable.createdAt,
      updated_at: projectBackgroundTasksTable.updatedAt,
    })
    .from(projectBackgroundTasksTable)
    .where(
      and(
        eq(projectBackgroundTasksTable.status, 'RUNNING'),
        isNull(projectBackgroundTasksTable.deletedAt),
      ),
    )
    .orderBy(asc(projectBackgroundTasksTable.createdAt))
    .all() as BackgroundTaskRow[];

  return rows.map(mapBackgroundTaskRow);
}

export async function findBackgroundTaskBySessionId(
  sqlite: Database,
  sessionId: string,
): Promise<BackgroundTaskPayload | null> {
  const row = getDrizzleDb(sqlite)
    .select({
      id: projectBackgroundTasksTable.id,
      project_id: projectBackgroundTasksTable.projectId,
      task_id: projectBackgroundTasksTable.taskId,
      title: projectBackgroundTasksTable.title,
      prompt: projectBackgroundTasksTable.prompt,
      agent_id: projectBackgroundTasksTable.agentId,
      status: projectBackgroundTasksTable.status,
      triggered_by: projectBackgroundTasksTable.triggeredBy,
      trigger_source: projectBackgroundTasksTable.triggerSource,
      priority: projectBackgroundTasksTable.priority,
      result_session_id: projectBackgroundTasksTable.resultSessionId,
      error_message: projectBackgroundTasksTable.errorMessage,
      attempts: projectBackgroundTasksTable.attempts,
      max_attempts: projectBackgroundTasksTable.maxAttempts,
      last_activity_at: projectBackgroundTasksTable.lastActivityAt,
      current_activity: projectBackgroundTasksTable.currentActivity,
      tool_call_count: projectBackgroundTasksTable.toolCallCount,
      input_tokens: projectBackgroundTasksTable.inputTokens,
      output_tokens: projectBackgroundTasksTable.outputTokens,
      workflow_run_id: projectBackgroundTasksTable.workflowRunId,
      workflow_step_name: projectBackgroundTasksTable.workflowStepName,
      specialist_id: projectBackgroundTasksTable.specialistId,
      depends_on_task_ids_json: projectBackgroundTasksTable.dependsOnTaskIdsJson,
      task_output: projectBackgroundTasksTable.taskOutput,
      started_at: projectBackgroundTasksTable.startedAt,
      completed_at: projectBackgroundTasksTable.completedAt,
      created_at: projectBackgroundTasksTable.createdAt,
      updated_at: projectBackgroundTasksTable.updatedAt,
    })
    .from(projectBackgroundTasksTable)
    .where(
      and(
        eq(projectBackgroundTasksTable.resultSessionId, sessionId),
        isNull(projectBackgroundTasksTable.deletedAt),
      ),
    )
    .get() as BackgroundTaskRow | undefined;

  return row ? mapBackgroundTaskRow(row) : null;
}

export async function updateBackgroundTaskStatus(
  sqlite: Database,
  backgroundTaskId: string,
  status: BackgroundTaskStatus,
  input?: {
    completedAt?: string | null;
    currentActivity?: string | null;
    errorMessage?: string | null;
    inputTokens?: number | null;
    lastActivityAt?: string | null;
    outputTokens?: number | null;
    resultSessionId?: string | null;
    startedAt?: string | null;
    taskOutput?: string | null;
    toolCallCount?: number | null;
  },
): Promise<BackgroundTaskPayload> {
  ensureBackgroundTaskStatus(status);
  const current = getBackgroundTaskRow(sqlite, backgroundTaskId);
  const attempts =
    status === 'RUNNING' && current.status !== 'RUNNING'
      ? current.attempts + 1
      : current.attempts;

  getDrizzleDb(sqlite)
    .update(projectBackgroundTasksTable)
    .set({
      status,
      resultSessionId:
        input?.resultSessionId === undefined
          ? current.result_session_id
          : input.resultSessionId,
      errorMessage:
        input?.errorMessage === undefined
          ? current.error_message
          : input.errorMessage,
      lastActivityAt:
        input?.lastActivityAt === undefined
          ? current.last_activity_at
          : input.lastActivityAt,
      currentActivity:
        input?.currentActivity === undefined
          ? current.current_activity
          : input.currentActivity,
      toolCallCount:
        input?.toolCallCount === undefined
          ? current.tool_call_count
          : input.toolCallCount,
      inputTokens:
        input?.inputTokens === undefined ? current.input_tokens : input.inputTokens,
      outputTokens:
        input?.outputTokens === undefined
          ? current.output_tokens
          : input.outputTokens,
      taskOutput:
        input?.taskOutput === undefined ? current.task_output : input.taskOutput,
      startedAt:
        input?.startedAt === undefined ? current.started_at : input.startedAt,
      completedAt:
        input?.completedAt === undefined
          ? current.completed_at
          : input.completedAt,
      attempts,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(projectBackgroundTasksTable.id, backgroundTaskId),
        isNull(projectBackgroundTasksTable.deletedAt),
      ),
    )
    .run();

  return getBackgroundTaskById(sqlite, backgroundTaskId);
}
