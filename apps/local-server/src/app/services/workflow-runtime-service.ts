import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type {
  TriggerWorkflowInput,
  WorkflowDefinitionPayload,
  WorkflowStepPayload,
} from '../schemas/workflow';
import { createBackgroundTask } from './background-task-service';
import { loadWorkflowDefinition } from './workflow-loader-service';

const workflowRunIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

function createWorkflowRunId() {
  return `wfr_${workflowRunIdGenerator()}`;
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

function insertWorkflowRun(
  sqlite: Database,
  workflow: WorkflowDefinitionPayload,
  workflowRunId: string,
  input: TriggerWorkflowInput,
) {
  const now = new Date().toISOString();

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
}

export async function triggerWorkflowRun(
  sqlite: Database,
  workflowId: string,
  input: TriggerWorkflowInput = {},
): Promise<{
  taskIds: string[];
  workflow: WorkflowDefinitionPayload;
  workflowRunId: string;
}> {
  const loaded = await loadWorkflowDefinition(sqlite, workflowId);
  const workflowRunId = createWorkflowRunId();
  insertWorkflowRun(sqlite, loaded.workflow, workflowRunId, input);

  const taskIds: string[] = [];
  let previousTaskIds: string[] = [];

  for (const group of loaded.stepGroups) {
    const groupTaskIds: string[] = [];

    for (const step of group) {
      const task = await createBackgroundTask(sqlite, {
        agentId: step.adapter ?? step.specialistId,
        dependsOnTaskIds: previousTaskIds,
        projectId: loaded.workflow.projectId,
        prompt: buildStepPrompt(step, {
          triggerPayload: input.triggerPayload,
          workflowName: loaded.workflow.name,
        }),
        specialistId: step.specialistId,
        title: `[${loaded.workflow.name}] ${step.name}`,
        triggerSource: 'workflow',
        triggeredBy: `workflow:${loaded.workflow.name}`,
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
    workflow: loaded.workflow,
    workflowRunId,
  };
}
