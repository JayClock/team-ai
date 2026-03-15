import type { Database } from 'better-sqlite3';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import type { DiagnosticLogger } from '../diagnostics';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import {
  createAcpSession,
  promptAcpSession,
} from './acp-service';
import type { DispatchTaskCallbacks } from './task-dispatch-service';

interface TaskExecutionRuntimeDependencies {
  broker: AcpStreamBroker;
  logger?: DiagnosticLogger;
  runtime: AcpRuntimeClient;
  sqlite: Database;
}

export type TaskExecutionRuntime = DispatchTaskCallbacks;

export function createTaskExecutionRuntime(
  dependencies: TaskExecutionRuntimeDependencies,
): TaskExecutionRuntime {
  return {
    async createSession(input) {
      const session = await createAcpSession(
        dependencies.sqlite,
        dependencies.broker,
        dependencies.runtime,
        input,
        {
          logger: dependencies.logger,
          source: 'task_execution_runtime_create_session',
        },
      );

      return {
        id: session.id,
      };
    },
    async isProviderAvailable(provider: string) {
      return dependencies.runtime.isConfigured(provider);
    },
    async promptSession(input) {
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
          source: 'task_execution_runtime_prompt_session',
        },
      );
    },
  };
}
