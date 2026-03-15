import type { Database } from 'better-sqlite3';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import type { DiagnosticLogger } from '../diagnostics';
import { ProblemError } from '../errors/problem-error';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import type { TaskRunPayload } from '../schemas/task-run';
import {
  getAcpSessionById,
  createAcpSession,
  promptAcpSession,
} from './acp-service';
import type { TaskPayload } from '../schemas/task';
import {
  type ExecuteTaskResult,
  executeTask as executeTaskWithCallbacks,
  maybeAutoExecutePatchedTask as maybeAutoExecutePatchedTaskWithCallbacks,
  type AutoExecuteTaskPatch,
} from './task-orchestration-service';
import type { DispatchTasksResult } from './task-dispatch-service';

interface TaskWorkflowOrchestratorDependencies {
  broker: AcpStreamBroker;
  callbackSource: string;
  logger?: DiagnosticLogger;
  runtime: AcpRuntimeClient;
  sqlite: Database;
}

interface TaskWorkflowExecutionOptions {
  callerSessionId?: string;
  logger?: DiagnosticLogger;
  retryOfRunId?: string | null;
  source?: string;
}

interface DispatchReadyTasksOptions extends TaskWorkflowExecutionOptions {
  limit?: number;
}

export interface TaskWorkflowOrchestrator {
  dispatchReadyTasks(
    projectId: string,
    options?: DispatchReadyTasksOptions,
  ): Promise<DispatchTasksResult>;
  executeTask(
    taskId: string,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<ExecuteTaskResult>;
  maybeAutoExecutePatchedTask(
    task: TaskPayload,
    patch: AutoExecuteTaskPatch,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<TaskPayload>;
  retryTaskRun(
    taskRunId: string,
    options?: Omit<TaskWorkflowExecutionOptions, 'callerSessionId' | 'retryOfRunId'>,
  ): Promise<TaskRunPayload>;
}

function throwTaskRunRetrySessionMissing(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-session-missing',
    title: 'Task Run Retry Session Missing',
    status: 409,
    detail:
      `Task run ${taskRunId} cannot be retried because no parent session is available`,
  });
}

function throwTaskRunRetryDispatchBlocked(
  taskRunId: string,
  detail: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-dispatch-blocked',
    title: 'Task Run Retry Dispatch Blocked',
    status: 409,
    detail,
  });
}

function throwTaskRunRetryNotCreated(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-not-created',
    title: 'Task Run Retry Not Created',
    status: 500,
    detail: `Task run ${taskRunId} was retried but no retry run was recorded`,
  });
}

function createDispatchCallbacks(
  dependencies: TaskWorkflowOrchestratorDependencies,
) {
  return {
    async createSession(input: {
      actorUserId: string;
      goal?: string;
      parentSessionId?: string | null;
      projectId: string;
      provider: string;
      retryOfRunId?: string | null;
      role?: string | null;
      specialistId?: string;
      taskId?: string | null;
    }) {
      const session = await createAcpSession(
        dependencies.sqlite,
        dependencies.broker,
        dependencies.runtime,
        input,
        {
          logger: dependencies.logger,
          source: dependencies.callbackSource,
        },
      );

      return {
        id: session.id,
      };
    },
    async isProviderAvailable(provider: string) {
      return dependencies.runtime.isConfigured(provider);
    },
    async promptSession(input: {
      projectId: string;
      prompt: string;
      sessionId: string;
    }) {
      return await promptAcpSession(
        dependencies.sqlite,
        dependencies.broker,
        dependencies.runtime,
        input.projectId,
        input.sessionId,
        {
          prompt: input.prompt,
        },
        {
          logger: dependencies.logger,
          source: dependencies.callbackSource,
        },
      );
    },
  };
}

export function createTaskWorkflowOrchestrator(
  dependencies: TaskWorkflowOrchestratorDependencies,
): TaskWorkflowOrchestrator {
  const callbacks = createDispatchCallbacks(dependencies);

  return {
    async dispatchReadyTasks(
      projectId: string,
      options: DispatchReadyTasksOptions = {},
    ) {
      const { dispatchTasks } = await import('./task-dispatch-service.js');

      return await dispatchTasks(
        dependencies.sqlite,
        callbacks,
        {
          callerSessionId: options.callerSessionId,
          limit: options.limit,
          projectId,
        },
        {
          logger: options.logger ?? dependencies.logger,
          source: options.source,
        },
      );
    },
    async executeTask(taskId: string, options: TaskWorkflowExecutionOptions = {}) {
      return await executeTaskWithCallbacks(dependencies.sqlite, taskId, {
        callbacks,
        callerSessionId: options.callerSessionId,
        logger: options.logger ?? dependencies.logger,
        retryOfRunId: options.retryOfRunId,
        source: options.source,
      });
    },
    async maybeAutoExecutePatchedTask(
      task: TaskPayload,
      patch: AutoExecuteTaskPatch,
      options: TaskWorkflowExecutionOptions = {},
    ) {
      return await maybeAutoExecutePatchedTaskWithCallbacks(
        dependencies.sqlite,
        task,
        patch,
        {
          callbacks,
          callerSessionId: options.callerSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: options.retryOfRunId,
          source: options.source,
        },
      );
    },
    async retryTaskRun(
      taskRunId: string,
      options: Omit<
        TaskWorkflowExecutionOptions,
        'callerSessionId' | 'retryOfRunId'
      > = {},
    ) {
      const { getLatestTaskRunByTaskId, getRetryableTaskRunById } =
        await import('./task-run-service.js');
      const sourceRun = await getRetryableTaskRunById(
        dependencies.sqlite,
        taskRunId,
      );
      const sourceSession = sourceRun.sessionId
        ? await getAcpSessionById(dependencies.sqlite, sourceRun.sessionId)
        : null;
      const executionSessionId =
        sourceSession?.parentSession?.id ?? sourceSession?.id ?? null;

      if (!executionSessionId) {
        throwTaskRunRetrySessionMissing(taskRunId);
      }

      const result = await executeTaskWithCallbacks(
        dependencies.sqlite,
        sourceRun.taskId,
        {
          callbacks,
          callerSessionId: executionSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: sourceRun.id,
          source: options.source,
        },
      );

      if (!result.dispatch.attempted || !result.dispatch.result?.dispatched) {
        throwTaskRunRetryDispatchBlocked(
          taskRunId,
          result.dispatch.errorMessage ??
            `Task run ${taskRunId} could not be retried`,
        );
      }

      const retriedRun = await getLatestTaskRunByTaskId(
        dependencies.sqlite,
        sourceRun.taskId,
      );

      if (
        !retriedRun ||
        retriedRun.id === sourceRun.id ||
        retriedRun.retryOfRunId !== sourceRun.id
      ) {
        throwTaskRunRetryNotCreated(taskRunId);
      }

      return retriedRun;
    },
  };
}
