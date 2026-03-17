import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
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

export async function createBackgroundTask(
  sqlite: Database,
  input: CreateBackgroundTaskInput,
): Promise<BackgroundTaskPayload> {
  await getProjectById(sqlite, input.projectId);

  const now = new Date().toISOString();
  const title = input.title?.trim() || input.prompt.trim().slice(0, 60);
  const id = createBackgroundTaskId();

  sqlite
    .prepare(
      `
        INSERT INTO project_background_tasks (
          id, project_id, task_id, title, prompt, agent_id, status,
          triggered_by, trigger_source, priority, attempts, max_attempts,
          workflow_run_id, workflow_step_name, depends_on_task_ids_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          @id, @projectId, @taskId, @title, @prompt, @agentId, 'PENDING',
          @triggeredBy, @triggerSource, @priority, 0, @maxAttempts,
          @workflowRunId, @workflowStepName, '[]',
          @createdAt, @updatedAt, NULL
        )
      `,
    )
    .run({
      agentId: input.agentId,
      createdAt: now,
      id,
      maxAttempts: input.maxAttempts ?? 1,
      priority: input.priority ?? 'NORMAL',
      projectId: input.projectId,
      prompt: input.prompt,
      taskId: input.taskId ?? null,
      title,
      triggeredBy: input.triggeredBy ?? 'user',
      triggerSource: input.triggerSource ?? 'manual',
      updatedAt: now,
      workflowRunId: input.workflowRunId ?? null,
      workflowStepName: input.workflowStepName ?? null,
    });

  return getBackgroundTaskById(sqlite, id);
}

export async function listBackgroundTasks(
  sqlite: Database,
  query: ListBackgroundTasksQuery,
): Promise<BackgroundTaskListPayload> {
  await getProjectById(sqlite, query.projectId);
  const offset = (query.page - 1) * query.pageSize;
  const normalizedStatus = ensureBackgroundTaskStatus(query.status);
  const filters = ['project_id = @projectId', 'deleted_at IS NULL'];
  const parameters: Record<string, unknown> = {
    limit: query.pageSize,
    offset,
    projectId: query.projectId,
  };

  if (normalizedStatus) {
    filters.push('status = @status');
    parameters.status = normalizedStatus;
  }

  const whereClause = filters.join(' AND ');
  const items = sqlite
    .prepare(
      `
        SELECT id, project_id, task_id, title, prompt, agent_id, status,
               triggered_by, trigger_source, priority, result_session_id,
               error_message, attempts, max_attempts, last_activity_at,
               current_activity, tool_call_count, input_tokens, output_tokens,
               workflow_run_id, workflow_step_name, depends_on_task_ids_json,
               task_output, started_at, completed_at, created_at, updated_at
        FROM project_background_tasks
        WHERE ${whereClause}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as BackgroundTaskRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_background_tasks
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

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
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, task_id, title, prompt, agent_id, status,
               triggered_by, trigger_source, priority, result_session_id,
               error_message, attempts, max_attempts, last_activity_at,
               current_activity, tool_call_count, input_tokens, output_tokens,
               workflow_run_id, workflow_step_name, depends_on_task_ids_json,
               task_output, started_at, completed_at, created_at, updated_at
        FROM project_background_tasks
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(backgroundTaskId) as BackgroundTaskRow | undefined;

  if (!row) {
    throwBackgroundTaskNotFound(backgroundTaskId);
  }

  return mapBackgroundTaskRow(row);
}
