import type { Database } from 'better-sqlite3';
import type {
  WorkflowDefinitionPayload,
  WorkflowStepPayload,
} from '../schemas/workflow';
import { getWorkflowById } from './workflow-service';

export interface LoadedWorkflowDefinition {
  stepGroups: WorkflowStepPayload[][];
  workflow: WorkflowDefinitionPayload;
}

function groupStepsByParallel(steps: WorkflowStepPayload[]) {
  const groups: WorkflowStepPayload[][] = [];
  let currentGroup: WorkflowStepPayload[] = [];
  let currentParallelGroup: string | null = null;

  for (const step of steps) {
    if (step.parallelGroup && step.parallelGroup === currentParallelGroup) {
      currentGroup.push(step);
      continue;
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    currentGroup = [step];
    currentParallelGroup = step.parallelGroup ?? null;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

export async function loadWorkflowDefinition(
  sqlite: Database,
  workflowId: string,
): Promise<LoadedWorkflowDefinition> {
  const workflow = await getWorkflowById(sqlite, workflowId);

  return {
    stepGroups: groupStepsByParallel(workflow.steps),
    workflow,
  };
}
