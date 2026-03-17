import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import { getBackgroundTaskById } from './background-task-service';
import type { KanbanEventService } from './kanban-event-service';
import {
  getWorkflowRunById,
  listRunningWorkflowRunIds,
  reconcileWorkflowRunById,
} from './workflow-service';

export interface WorkflowExecutorService {
  reconcileRunningWorkflowRuns(): void;
  start(): void;
  stop(): void;
}

interface CreateWorkflowExecutorServiceInput {
  events: KanbanEventService;
  logger?: DiagnosticLogger;
  sqlite: Database;
}

export function createWorkflowExecutorService(
  input: CreateWorkflowExecutorServiceInput,
): WorkflowExecutorService {
  let unsubscribe: (() => void) | null = null;

  function reconcileWorkflowRun(workflowRunId: string) {
    const workflowRun = reconcileWorkflowRunById(input.sqlite, workflowRunId);
    input.logger?.info?.(
      {
        completedSteps: workflowRun.completedSteps,
        currentStepName: workflowRun.currentStepName,
        failedSteps: workflowRun.failedSteps,
        status: workflowRun.status,
        workflowRunId,
      },
      'Reconciled workflow run progress',
    );
  }

  function reconcileRunningWorkflowRuns() {
    for (const workflowRunId of listRunningWorkflowRunIds(input.sqlite)) {
      reconcileWorkflowRun(workflowRunId);
    }
  }

  return {
    reconcileRunningWorkflowRuns,

    start() {
      if (unsubscribe) {
        return;
      }

      reconcileRunningWorkflowRuns();
      unsubscribe = input.events.subscribe(async (event) => {
        if (event.type !== 'background-task.completed') {
          return;
        }

        const backgroundTask = await getBackgroundTaskById(
          input.sqlite,
          event.backgroundTaskId,
        ).catch(() => null);
        if (!backgroundTask?.workflowRunId) {
          return;
        }

        reconcileWorkflowRun(backgroundTask.workflowRunId);
      });
    },

    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

export function getWorkflowRunExecutionState(
  sqlite: Database,
  workflowRunId: string,
) {
  return getWorkflowRunById(sqlite, workflowRunId);
}
