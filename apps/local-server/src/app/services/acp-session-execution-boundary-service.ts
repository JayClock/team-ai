import type { Database } from 'better-sqlite3';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import type { DiagnosticLogger } from '../diagnostics';
import type { AcpStreamBroker } from '../plugins/acp-stream';
import {
  createAcpSession,
  promptAcpSession,
  type PromptSessionInput,
} from './acp-service';
import type { TaskSessionDispatchCallbacks } from './task-session-dispatch-service';

interface AcpSessionExecutionBoundaryDependencies {
  broker: AcpStreamBroker;
  logger?: DiagnosticLogger;
  runtime: AcpRuntimeClient;
  sqlite: Database;
}

interface BoundaryCallOptions {
  source: string;
}

export interface AcpSessionExecutionBoundary {
  createSession(
    input: Parameters<typeof createAcpSession>[3],
    options: BoundaryCallOptions,
  ): ReturnType<typeof createAcpSession>;
  isProviderAvailable(provider: string): Promise<boolean>;
  promptSession(
    projectId: string,
    sessionId: string,
    input: PromptSessionInput,
    options: BoundaryCallOptions,
  ): ReturnType<typeof promptAcpSession>;
}

interface TaskSessionDispatchCallbackSources {
  createSessionSource?: string;
  promptSessionSource?: string;
}

export function createAcpSessionExecutionBoundary(
  dependencies: AcpSessionExecutionBoundaryDependencies,
): AcpSessionExecutionBoundary {
  return {
    async createSession(input, options) {
      return await createAcpSession(
        dependencies.sqlite,
        dependencies.broker,
        dependencies.runtime,
        input,
        {
          logger: dependencies.logger,
          source: options.source,
        },
      );
    },

    async isProviderAvailable(provider: string) {
      return dependencies.runtime.isConfigured(provider);
    },

    async promptSession(projectId, sessionId, input, options) {
      return await promptAcpSession(
        dependencies.sqlite,
        dependencies.broker,
        dependencies.runtime,
        projectId,
        sessionId,
        input,
        {
          logger: dependencies.logger,
          source: options.source,
        },
      );
    },
  };
}

export function createTaskSessionDispatchCallbacks(
  boundary: AcpSessionExecutionBoundary,
  sources: TaskSessionDispatchCallbackSources = {},
): TaskSessionDispatchCallbacks {
  return {
    async createSession(input) {
      const session = await boundary.createSession(input, {
        source:
          sources.createSessionSource ?? 'task_session_runtime_create_session',
      });

      return {
        id: session.id,
      };
    },

    async isProviderAvailable(provider: string) {
      return await boundary.isProviderAvailable(provider);
    },

    async promptSession(input) {
      return await boundary.promptSession(
        input.projectId,
        input.sessionId,
        {
          prompt: input.prompt,
        },
        {
          source:
            sources.promptSessionSource ??
            'task_session_runtime_prompt_session',
        },
      );
    },
  };
}

export const createDispatchTaskCallbacks = createTaskSessionDispatchCallbacks;
