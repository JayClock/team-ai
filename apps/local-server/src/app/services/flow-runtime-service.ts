import type { Database } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { FlowPayload } from '../schemas/flow';
import type {
  WorkflowDefinitionPayload,
  WorkflowRunListPayload,
  WorkflowRunPayload,
  WorkflowStepPayload,
} from '../schemas/workflow';
import { getProjectById } from './project-service';
import { getFlowById } from './flow-service';
import { getWorkflowById, listWorkflowRuns, triggerWorkflow } from './workflow-service';

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

function toWorkflowVersion(flow: FlowPayload) {
  const majorVersion = Number.parseInt(flow.version ?? '', 10);
  return Number.isFinite(majorVersion) && majorVersion > 0 ? majorVersion : 1;
}

function toWorkflowSteps(flow: FlowPayload): WorkflowStepPayload[] {
  return flow.steps.map((step) => ({
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
      description: flow.description,
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
