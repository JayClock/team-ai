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
import { createBackgroundTask } from './background-task-service';
import { getProjectById } from './project-service';

const workflowIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const workflowRunIdGenerator = customAlphabet(
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

function createWorkflowId() {
  return `wf_${workflowIdGenerator()}`;
}

function createWorkflowRunId() {
  return `wfr_${workflowRunIdGenerator()}`;
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

function mapWorkflowRunRow(row: WorkflowRunRow): WorkflowRunPayload {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    currentStepName: row.current_step_name,
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    status: row.status,
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
    items: rows.map(mapWorkflowRunRow),
    workflowId,
  };
}

function groupStepsByParallel(steps: WorkflowStepPayload[]) {
  const groups: WorkflowStepPayload[][] = [];
  let currentGroup: WorkflowStepPayload[] = [];
  let currentParallelGroup: string | null = null;

  for (const step of steps) {
    if (step.parallelGroup) {
      if (step.parallelGroup === currentParallelGroup) {
        currentGroup.push(step);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [step];
        currentParallelGroup = step.parallelGroup;
      }
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      groups.push([step]);
      currentGroup = [];
      currentParallelGroup = null;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function buildStepPrompt(
  step: WorkflowStepPayload,
  input: {
    triggerPayload?: string | null;
    workflowName: string;
  },
) {
  return step.prompt.replaceAll('${trigger.payload}', input.triggerPayload ?? '').replaceAll(
    '${workflow.name}',
    input.workflowName,
  );
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
  const workflow = await getWorkflowById(sqlite, workflowId);
  const now = new Date().toISOString();
  const workflowRunId = createWorkflowRunId();

  sqlite
    .prepare(
      `
        INSERT INTO project_workflow_runs (
          id, workflow_id, project_id, workflow_name, workflow_version, status,
          trigger_source, trigger_payload, current_step_name, total_steps,
          started_at, completed_at, created_at, updated_at, deleted_at
        ) VALUES (
          @id, @workflowId, @projectId, @workflowName, @workflowVersion, 'RUNNING',
          @triggerSource, @triggerPayload, @currentStepName, @totalSteps,
          @startedAt, NULL, @createdAt, @updatedAt, NULL
        )
      `,
    )
    .run({
      createdAt: now,
      currentStepName: workflow.steps[0]?.name ?? null,
      id: workflowRunId,
      projectId: workflow.projectId,
      startedAt: now,
      totalSteps: workflow.steps.length,
      triggerPayload: input.triggerPayload ?? null,
      triggerSource: input.triggerSource ?? 'manual',
      updatedAt: now,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
    });

  const taskIds: string[] = [];
  let previousTaskIds: string[] = [];

  for (const group of groupStepsByParallel(workflow.steps)) {
    const groupTaskIds: string[] = [];

    for (const step of group) {
      const task = await createBackgroundTask(sqlite, {
        agentId: step.specialistId,
        dependsOnTaskIds: previousTaskIds,
        projectId: workflow.projectId,
        prompt: buildStepPrompt(step, {
          triggerPayload: input.triggerPayload,
          workflowName: workflow.name,
        }),
        title: `[${workflow.name}] ${step.name}`,
        triggerSource: 'workflow',
        triggeredBy: `workflow:${workflow.name}`,
        workflowRunId,
        workflowStepName: step.name,
      });

      groupTaskIds.push(task.id);
      taskIds.push(task.id);
    }

    previousTaskIds = groupTaskIds;
  }

  return {
    taskIds,
    workflow,
    workflowRun: getWorkflowRunById(sqlite, workflowRunId),
  };
}

export function getWorkflowRunById(
  sqlite: Database,
  workflowRunId: string,
): WorkflowRunPayload {
  return mapWorkflowRunRow(getWorkflowRunRow(sqlite, workflowRunId));
}
