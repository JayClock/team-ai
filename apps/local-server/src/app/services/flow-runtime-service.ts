import type { Database } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { BackgroundTaskPayload } from '../schemas/background-task';
import type { FlowPayload } from '../schemas/flow';
import type {
  WorkflowDefinitionPayload,
  WorkflowRunListPayload,
  WorkflowRunPayload,
  WorkflowStepPayload,
} from '../schemas/workflow';
import { ProblemError } from '../errors/problem-error';
import { getProjectById } from './project-service';
import { getFlowById } from './flow-service';
import {
  getWorkflowById,
  getWorkflowRunById,
  listWorkflowRuns,
  triggerWorkflow,
} from './workflow-service';

const flowDescriptionPrefix = '[team-ai-flow-id] ';

interface TriggerFlowInput {
  flowId: string;
  projectId: string;
  triggerPayload?: string | null;
  triggerSource?: 'manual' | 'schedule' | 'webhook';
}

function createResourceWorkflowId(projectId: string, flowId: string) {
  const digest = createHash('sha1')
    .update(`${projectId}:${flowId}`)
    .digest('hex')
    .slice(0, 16);

  return `wff_${digest}`;
}

function toWorkflowDefinitionName(flow: FlowPayload) {
  return `Flow · ${flow.name}`;
}

function toWorkflowDescription(flow: FlowPayload) {
  const suffix = flow.description?.trim();
  return suffix
    ? `${flowDescriptionPrefix}${flow.id}\n${suffix}`
    : `${flowDescriptionPrefix}${flow.id}`;
}

function toWorkflowVersion(flow: FlowPayload) {
  const majorVersion = Number.parseInt(flow.version ?? '', 10);
  return Number.isFinite(majorVersion) && majorVersion > 0 ? majorVersion : 1;
}

function toWorkflowSteps(flow: FlowPayload): WorkflowStepPayload[] {
  return flow.steps.map((step) => ({
    adapter: step.adapter,
    name: step.name,
    parallelGroup: null,
    prompt: step.input,
    specialistId: step.specialistId,
  }));
}

async function upsertResourceWorkflowDefinition(
  sqlite: Database,
  projectId: string,
  flow: FlowPayload,
) {
  await getProjectById(sqlite, projectId);

  const now = new Date().toISOString();
  const workflowId = createResourceWorkflowId(projectId, flow.id);
  const workflowName = toWorkflowDefinitionName(flow);
  const workflowVersion = toWorkflowVersion(flow);
  const workflowSteps = toWorkflowSteps(flow);

  sqlite
    .prepare(
      `
        INSERT INTO project_workflow_definitions (
          id,
          project_id,
          name,
          description,
          version,
          steps_json,
          created_at,
          updated_at,
          deleted_at
        ) VALUES (
          @id,
          @projectId,
          @name,
          @description,
          @version,
          @stepsJson,
          @createdAt,
          @updatedAt,
          NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          version = excluded.version,
          steps_json = excluded.steps_json,
          updated_at = excluded.updated_at,
          deleted_at = NULL
      `,
    )
    .run({
      createdAt: now,
      description: toWorkflowDescription(flow),
      id: workflowId,
      name: workflowName,
      projectId,
      stepsJson: JSON.stringify(workflowSteps),
      updatedAt: now,
      version: workflowVersion,
    });

  return getWorkflowById(sqlite, workflowId);
}

export async function syncFlowWorkflowDefinition(
  sqlite: Database,
  projectId: string,
  flowId: string,
): Promise<WorkflowDefinitionPayload> {
  const flow = await getFlowById(sqlite, projectId, flowId);

  return upsertResourceWorkflowDefinition(sqlite, projectId, flow);
}

export async function triggerFlow(
  sqlite: Database,
  input: TriggerFlowInput,
): Promise<{
  flow: FlowPayload;
  taskIds: string[];
  workflow: WorkflowDefinitionPayload;
  workflowRun: WorkflowRunPayload;
}> {
  const flow = await getFlowById(sqlite, input.projectId, input.flowId);
  const workflow = await upsertResourceWorkflowDefinition(
    sqlite,
    input.projectId,
    flow,
  );
  const triggered = await triggerWorkflow(sqlite, workflow.id, {
    triggerPayload: input.triggerPayload,
    triggerSource: input.triggerSource,
  });

  return {
    flow,
    taskIds: triggered.taskIds,
    workflow,
    workflowRun: triggered.workflowRun,
  };
}

export async function listFlowRuns(
  sqlite: Database,
  projectId: string,
  flowId: string,
): Promise<WorkflowRunListPayload> {
  const workflow = await syncFlowWorkflowDefinition(sqlite, projectId, flowId);
  return listWorkflowRuns(sqlite, workflow.id);
}

export async function getFlowRun(
  sqlite: Database,
  projectId: string,
  flowId: string,
  workflowRunId: string,
): Promise<WorkflowRunPayload> {
  const workflow = await syncFlowWorkflowDefinition(sqlite, projectId, flowId);
  const workflowRun = await getWorkflowRunById(sqlite, workflowRunId);

  if (
    workflowRun.projectId !== projectId ||
    workflowRun.workflowId !== workflow.id
  ) {
    throw new ProblemError({
      detail: `Workflow run ${workflowRunId} was not found for flow ${flowId}`,
      status: 404,
      title: 'Flow Run Not Found',
      type: 'https://team-ai.dev/problems/flow-run-not-found',
    });
  }

  return workflowRun;
}

function resolveFlowIdFromWorkflowDescription(description: string | null | undefined) {
  const trimmed = description?.trim();

  if (!trimmed?.startsWith(flowDescriptionPrefix)) {
    return null;
  }

  const [header] = trimmed.split('\n', 1);
  const flowId = header.slice(flowDescriptionPrefix.length).trim();

  return flowId || null;
}

function parseRuntimeVariable(value: string) {
  const envDefaultMatch = value.match(/^\$\{([A-Z0-9_]+):-([^}]+)\}$/);
  if (!envDefaultMatch) {
    return value;
  }

  return process.env[envDefaultMatch[1]]?.trim() || envDefaultMatch[2].trim();
}

function buildResolvedFlowVariables(flow: FlowPayload) {
  const resolved = new Map<string, string>();

  const resolveVariable = (key: string, seen: Set<string>): string => {
    if (resolved.has(key)) {
      return resolved.get(key) ?? '';
    }

    if (seen.has(key)) {
      return '';
    }

    seen.add(key);
    const raw = flow.variables[key];
    if (!raw) {
      return '';
    }

    const normalized = parseRuntimeVariable(raw).replace(
      /\$\{([A-Za-z0-9_-]+)\}/g,
      (_match, variableName: string) => {
        if (variableName === key) {
          return raw;
        }

        return resolveVariable(variableName, seen);
      },
    );

    resolved.set(key, normalized);
    seen.delete(key);
    return normalized;
  };

  for (const key of Object.keys(flow.variables)) {
    resolveVariable(key, new Set<string>());
  }

  return resolved;
}

function renderFlowTemplate(
  template: string,
  input: {
    flow: FlowPayload;
    stepOutputs: Map<string, string>;
    triggerPayload: string | null;
  },
) {
  const resolvedVariables = buildResolvedFlowVariables(input.flow);

  return template
    .replaceAll('${trigger.payload}', input.triggerPayload ?? '')
    .replaceAll('${workflow.name}', input.flow.name)
    .replace(/\$\{steps\.([^}]+)\.output\}/g, (_match, stepName: string) => {
      return input.stepOutputs.get(stepName.trim()) ?? '';
    })
    .replace(/\$\{([A-Za-z0-9_-]+)\}/g, (match, variableName: string) => {
      return resolvedVariables.get(variableName) ?? match;
    });
}

async function getWorkflowRunContext(
  sqlite: Database,
  workflowRunId: string,
): Promise<{
  projectId: string;
  triggerPayload: string | null;
  workflow: WorkflowDefinitionPayload;
} | null> {
  const row = sqlite
    .prepare(
      `
        SELECT workflow_id, project_id, trigger_payload
        FROM project_workflow_runs
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(workflowRunId) as
    | {
        project_id: string;
        trigger_payload: string | null;
        workflow_id: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    projectId: row.project_id,
    triggerPayload: row.trigger_payload,
    workflow: await getWorkflowById(sqlite, row.workflow_id),
  };
}

function listWorkflowRunTaskOutputs(sqlite: Database, workflowRunId: string) {
  const rows = sqlite
    .prepare(
      `
        SELECT workflow_step_name, task_output
        FROM project_background_tasks
        WHERE workflow_run_id = ? AND deleted_at IS NULL
      `,
    )
    .all(workflowRunId) as Array<{
      task_output: string | null;
      workflow_step_name: string | null;
    }>;

  return new Map(
    rows
      .filter((row) => row.workflow_step_name && row.task_output)
      .map((row) => [row.workflow_step_name as string, row.task_output as string]),
  );
}

export async function resolveBackgroundTaskFlowExecution(
  sqlite: Database,
  task: Pick<
    BackgroundTaskPayload,
    'projectId' | 'prompt' | 'workflowRunId' | 'workflowStepName'
  >,
) {
  if (!task.workflowRunId || !task.workflowStepName) {
    return null;
  }

  const runContext = await getWorkflowRunContext(sqlite, task.workflowRunId);
  if (!runContext || runContext.projectId !== task.projectId) {
    return null;
  }

  const flowId = resolveFlowIdFromWorkflowDescription(runContext.workflow.description);
  if (!flowId) {
    return null;
  }

  const flow = await getFlowById(sqlite, task.projectId, flowId);
  const step = flow.steps.find((item) => item.name === task.workflowStepName);
  if (!step) {
    return null;
  }

  const stepOutputs = listWorkflowRunTaskOutputs(sqlite, task.workflowRunId);
  const prompt = renderFlowTemplate(step.input, {
    flow,
    stepOutputs,
    triggerPayload: runContext.triggerPayload,
  });
  const modelOverride = step.config.model
    ? renderFlowTemplate(step.config.model, {
        flow,
        stepOutputs,
        triggerPayload: runContext.triggerPayload,
      })
    : null;

  return {
    flow,
    modelOverride: modelOverride?.trim() || null,
    prompt,
    step,
  };
}
