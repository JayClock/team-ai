import type { Database } from 'better-sqlite3';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import type { DiagnosticLogger } from '../diagnostics';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import {
  createAcpSession,
  promptAcpSession,
} from './acp-service';
import type { TaskPayload } from '../schemas/task';
import {
  executeTask as executeTaskWithCallbacks,
  maybeAutoExecutePatchedTask as maybeAutoExecutePatchedTaskWithCallbacks,
  type AutoExecuteTaskPatch,
} from './task-orchestration-service';

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
) {
  const callbacks = createDispatchCallbacks(dependencies);

  return {
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
  };
}
