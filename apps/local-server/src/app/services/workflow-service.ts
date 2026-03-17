import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  CreateWorkflowInput,
  TriggerWorkflowInput,
  WorkflowDefinitionPayload,
  WorkflowListPayload,
  WorkflowRunListPayload,
  WorkflowRunPayload,
  WorkflowRunStatus,
  WorkflowStepPayload,
} from '../schemas/workflow';
import { getProjectById } from './project-service';
import { triggerWorkflowRun } from './workflow-runtime-service';

const workflowIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface WorkflowDefinitionRow {
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  project_id: string;
  steps_json: string;
  updated_at: string;
  version: number;
}

interface WorkflowRunRow {
  completed_at: string | null;
  created_at: string;
  current_step_name: string | null;
  id: string;
  project_id: string;
  started_at: string | null;
  status: WorkflowRunStatus;
  total_steps: number;
  trigger_payload: string | null;
  trigger_source: 'manual' | 'schedule' | 'webhook';
  updated_at: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version: number;
}

interface WorkflowRunTaskRow {
  completed_at: string | null;
  created_at: string;
  id: string;
  started_at: string | null;
  status: string;
  workflow_step_name: string | null;
}

interface WorkflowRunProgress {
  completedAt: string | null;
  completedSteps: number;
  currentStepName: string | null;
  failedSteps: number;
  pendingSteps: number;
  runningSteps: number;
  status: WorkflowRunStatus;
}

function createWorkflowId() {
  return `wf_${workflowIdGenerator()}`;
}

function parseWorkflowSteps(value: string): WorkflowStepPayload[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (step): step is WorkflowStepPayload =>
            typeof step === 'object' &&
            step !== null &&
            typeof (step as WorkflowStepPayload).name === 'string' &&
            typeof (step as WorkflowStepPayload).prompt === 'string' &&
            typeof (step as WorkflowStepPayload).specialistId === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function mapWorkflowDefinitionRow(
  row: WorkflowDefinitionRow,
): WorkflowDefinitionPayload {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    steps: parseWorkflowSteps(row.steps_json),
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapWorkflowRunRow(
  row: WorkflowRunRow,
  progress: WorkflowRunProgress,
): WorkflowRunPayload {
  return {
    completedAt: progress.completedAt,
    completedSteps: progress.completedSteps,
    createdAt: row.created_at,
    currentStepName: progress.currentStepName,
    failedSteps: progress.failedSteps,
    id: row.id,
    pendingSteps: progress.pendingSteps,
    projectId: row.project_id,
    runningSteps: progress.runningSteps,
    startedAt: row.started_at,
    status: progress.status,
    totalSteps: row.total_steps,
    triggerPayload: row.trigger_payload,
    triggerSource: row.trigger_source,
    updatedAt: row.updated_at,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
  };
}

function throwWorkflowNotFound(workflowId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/workflow-not-found',
    title: 'Workflow Not Found',
    status: 404,
    detail: `Workflow ${workflowId} was not found`,
  });
}

function throwWorkflowNameConflict(projectId: string, name: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/workflow-name-conflict',
    title: 'Workflow Name Conflict',
    status: 409,
    detail: `Workflow ${name} already exists in project ${projectId}`,
  });
}

function getWorkflowDefinitionRow(
  sqlite: Database,
  workflowId: string,
): WorkflowDefinitionRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, name, description, version, steps_json, created_at, updated_at
        FROM project_workflow_definitions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(workflowId) as WorkflowDefinitionRow | undefined;

  if (!row) {
    throwWorkflowNotFound(workflowId);
  }

  return row;
}

function listWorkflowRunTaskRows(
  sqlite: Database,
  workflowRunId: string,
): WorkflowRunTaskRow[] {
  return sqlite
    .prepare(
      `
        SELECT id, workflow_step_name, status, started_at, completed_at, created_at
        FROM project_background_tasks
        WHERE workflow_run_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
      `,
    )
    .all(workflowRunId) as WorkflowRunTaskRow[];
}

function resolveWorkflowRunProgress(
  sqlite: Database,
  row: WorkflowRunRow,
): WorkflowRunProgress {
  const tasks = listWorkflowRunTaskRows(sqlite, row.id);
  const workflow = mapWorkflowDefinitionRow(
    getWorkflowDefinitionRow(sqlite, row.workflow_id),
  );
  const stepTaskByName = new Map(
    tasks.map((task) => [task.workflow_step_name ?? task.id, task]),
  );

  const completedSteps = tasks.filter((task) => task.status === 'COMPLETED').length;
  const failedSteps = tasks.filter(
    (task) => task.status === 'FAILED' || task.status === 'CANCELLED',
  ).length;
  const runningSteps = tasks.filter((task) => task.status === 'RUNNING').length;
  const pendingSteps = tasks.filter((task) => task.status === 'PENDING').length;

  const currentStep =
    workflow.steps.find((step) => {
      const task = stepTaskByName.get(step.name);
      return task ? task.status !== 'COMPLETED' : true;
    }) ?? null;

  const status =
    failedSteps > 0
      ? 'FAILED'
      : completedSteps === row.total_steps && row.total_steps > 0
        ? 'COMPLETED'
        : 'RUNNING';

  return {
    completedAt:
      status === 'COMPLETED' || status === 'FAILED'
        ? row.completed_at ?? new Date().toISOString()
        : null,
    completedSteps,
    currentStepName: status === 'COMPLETED' ? null : currentStep?.name ?? row.current_step_name,
    failedSteps,
    pendingSteps,
    runningSteps,
    status,
  };
}

function updateWorkflowRunRow(
  sqlite: Database,
  workflowRunId: string,
  progress: WorkflowRunProgress,
) {
  sqlite
    .prepare(
      `
        UPDATE project_workflow_runs
        SET
          status = @status,
          current_step_name = @currentStepName,
          completed_at = @completedAt,
          updated_at = @updatedAt
        WHERE id = @workflowRunId AND deleted_at IS NULL
      `,
    )
    .run({
      completedAt: progress.completedAt,
      currentStepName: progress.currentStepName,
      status: progress.status,
      updatedAt: new Date().toISOString(),
      workflowRunId,
    });
}

function getWorkflowRunRow(sqlite: Database, workflowRunId: string): WorkflowRunRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, workflow_id, project_id, workflow_name, workflow_version,
               status, trigger_source, trigger_payload, current_step_name,
               total_steps, started_at, completed_at, created_at, updated_at
        FROM project_workflow_runs
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(workflowRunId) as WorkflowRunRow | undefined;

  if (!row) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/workflow-run-not-found',
      title: 'Workflow Run Not Found',
      status: 404,
      detail: `Workflow run ${workflowRunId} was not found`,
    });
  }

  return row;
}

export async function createWorkflow(
  sqlite: Database,
  input: CreateWorkflowInput,
): Promise<WorkflowDefinitionPayload> {
  await getProjectById(sqlite, input.projectId);

  const existing = sqlite
    .prepare(
      `
        SELECT id
        FROM project_workflow_definitions
        WHERE project_id = ? AND name = ? AND deleted_at IS NULL
      `,
    )
    .get(input.projectId, input.name) as { id: string } | undefined;
  if (existing) {
    throwWorkflowNameConflict(input.projectId, input.name);
  }

  const now = new Date().toISOString();
  const workflowId = createWorkflowId();

  sqlite
    .prepare(
      `
        INSERT INTO project_workflow_definitions (
          id, project_id, name, description, version, steps_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          @id, @projectId, @name, @description, @version, @stepsJson,
          @createdAt, @updatedAt, NULL
        )
      `,
    )
    .run({
      createdAt: now,
      description: input.description ?? null,
      id: workflowId,
      name: input.name,
      projectId: input.projectId,
      stepsJson: JSON.stringify(input.steps),
      updatedAt: now,
      version: input.version ?? 1,
    });

  return getWorkflowById(sqlite, workflowId);
}

export async function listProjectWorkflows(
  sqlite: Database,
  projectId: string,
): Promise<WorkflowListPayload> {
  await getProjectById(sqlite, projectId);

  const rows = sqlite
    .prepare(
      `
        SELECT id, project_id, name, description, version, steps_json, created_at, updated_at
        FROM project_workflow_definitions
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(projectId) as WorkflowDefinitionRow[];

  return {
    items: rows.map(mapWorkflowDefinitionRow),
    projectId,
  };
}

export async function getWorkflowById(
  sqlite: Database,
  workflowId: string,
): Promise<WorkflowDefinitionPayload> {
  return mapWorkflowDefinitionRow(getWorkflowDefinitionRow(sqlite, workflowId));
}

export async function listWorkflowRuns(
  sqlite: Database,
  workflowId: string,
): Promise<WorkflowRunListPayload> {
  getWorkflowDefinitionRow(sqlite, workflowId);

  const rows = sqlite
    .prepare(
      `
        SELECT id, workflow_id, project_id, workflow_name, workflow_version,
               status, trigger_source, trigger_payload, current_step_name,
               total_steps, started_at, completed_at, created_at, updated_at
        FROM project_workflow_runs
        WHERE workflow_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(workflowId) as WorkflowRunRow[];

  return {
    items: rows.map((row) =>
      mapWorkflowRunRow(row, resolveWorkflowRunProgress(sqlite, row)),
    ),
    workflowId,
  };
}

export async function triggerWorkflow(
  sqlite: Database,
  workflowId: string,
  input: TriggerWorkflowInput = {},
): Promise<{
  taskIds: string[];
  workflow: WorkflowDefinitionPayload;
  workflowRun: WorkflowRunPayload;
}> {
  const triggered = await triggerWorkflowRun(sqlite, workflowId, input);

  return {
    taskIds: triggered.taskIds,
    workflow: triggered.workflow,
    workflowRun: getWorkflowRunById(sqlite, triggered.workflowRunId),
  };
}

export function getWorkflowRunById(
  sqlite: Database,
  workflowRunId: string,
): WorkflowRunPayload {
  const row = getWorkflowRunRow(sqlite, workflowRunId);
  return mapWorkflowRunRow(row, resolveWorkflowRunProgress(sqlite, row));
}

export function reconcileWorkflowRunById(
  sqlite: Database,
  workflowRunId: string,
): WorkflowRunPayload {
  const row = getWorkflowRunRow(sqlite, workflowRunId);
  const progress = resolveWorkflowRunProgress(sqlite, row);
  updateWorkflowRunRow(sqlite, workflowRunId, progress);
  return getWorkflowRunById(sqlite, workflowRunId);
}

export function listRunningWorkflowRunIds(sqlite: Database): string[] {
  return (
    sqlite
      .prepare(
        `
          SELECT id
          FROM project_workflow_runs
          WHERE status = 'RUNNING' AND deleted_at IS NULL
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all() as Array<{ id: string }>
  ).map((row) => row.id);
}
