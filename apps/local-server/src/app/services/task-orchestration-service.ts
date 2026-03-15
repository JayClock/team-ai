import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import { ProblemError } from '../errors/problem-error';
import type { TaskPayload } from '../schemas/task';
import type {
  DispatchTaskCallbacks,
  DispatchTaskResult,
} from './task-dispatch-service';
import { getTaskById, updateTask } from './task-service';

export interface ExecuteTaskDispatchAttempt {
  attempted: boolean;
  errorMessage: string | null;
  result: DispatchTaskResult | null;
}

export interface ExecuteTaskOptions {
  callbacks: DispatchTaskCallbacks;
  callerSessionId?: string;
  logger?: DiagnosticLogger;
  retryOfRunId?: string | null;
  source?: string;
}

export interface ExecuteTaskResult {
  dispatch: ExecuteTaskDispatchAttempt;
  task: Awaited<ReturnType<typeof getTaskById>>;
}

export interface AutoExecuteTaskPatch {
  assignedProvider?: string | null;
  assignedRole?: string | null;
  assignedSpecialistId?: string | null;
  status?: string;
}

const executableTaskStatuses = new Set([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'FAILED',
  'CANCELLED',
]);

function shouldAutoExecutePatchedTask(
  patch: AutoExecuteTaskPatch,
  task: Pick<TaskPayload, 'executionSessionId' | 'status' | 'triggerSessionId'>,
) {
  if (task.status !== 'READY') {
    return false;
  }

  if (task.executionSessionId || task.triggerSessionId) {
    return false;
  }

  return (
    patch.status === 'READY' ||
    patch.assignedProvider !== undefined ||
    patch.assignedRole !== undefined ||
    patch.assignedSpecialistId !== undefined
  );
}

function throwTaskExecutionAlreadyActive(
  taskId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-execution-already-active',
    title: 'Task Execution Already Active',
    status: 409,
    detail: `Task ${taskId} is already executing in session ${sessionId}`,
    context: {
      sessionId,
      taskId,
    },
  });
}

function throwTaskExecutionNotAllowed(taskId: string, status: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-execution-not-allowed',
    title: 'Task Execution Not Allowed',
    status: 409,
    detail: `Task ${taskId} cannot be executed from status ${status}`,
    context: {
      status,
      taskId,
    },
  });
}

export async function executeTask(
  sqlite: Database,
  taskId: string,
  options: ExecuteTaskOptions,
): Promise<ExecuteTaskResult> {
  const task = await getTaskById(sqlite, taskId);

  if (task.executionSessionId) {
    throwTaskExecutionAlreadyActive(taskId, task.executionSessionId);
  }

  if (!executableTaskStatuses.has(task.status)) {
    throwTaskExecutionNotAllowed(taskId, task.status);
  }

  const retryOfRunId = await (
    await import('./task-run-service.js')
  ).resolveRetryDispatchRunId(sqlite, {
    retryOfRunId: options.retryOfRunId,
    taskId,
  });

  if (task.status !== 'READY') {
    await updateTask(sqlite, taskId, {
      status: 'READY',
    });
  }

  try {
    const { dispatchTask } = await import('./task-dispatch-service.js');
    const result = await dispatchTask(
      sqlite,
      options.callbacks,
      {
        callerSessionId: options.callerSessionId,
        retryOfRunId,
        taskId,
      },
      {
        logger: options.logger,
        source: options.source ?? 'task_execute',
      },
    );

    return {
      dispatch: {
        attempted: true,
        errorMessage: null,
        result,
      },
      task: await getTaskById(sqlite, taskId),
    };
  } catch (error) {
    return {
      dispatch: {
        attempted: true,
        errorMessage:
          error instanceof Error ? error.message : 'Task dispatch failed',
        result: null,
      },
      task: await getTaskById(sqlite, taskId),
    };
  }
}

export async function maybeAutoExecutePatchedTask(
  sqlite: Database,
  task: TaskPayload,
  patch: AutoExecuteTaskPatch,
  options: ExecuteTaskOptions,
): Promise<TaskPayload> {
  if (!shouldAutoExecutePatchedTask(patch, task)) {
    return task;
  }

  return (await executeTask(sqlite, task.id, options)).task;
}
