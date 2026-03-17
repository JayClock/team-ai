import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createAcpSession, promptAcpSession } from '../services/acp-service';
import { createKanbanEventService, type KanbanEventService } from '../services/kanban-event-service';
import {
  createBackgroundWorkerHostService,
  type BackgroundWorkerHostService,
} from '../services/background-worker-host-service';
import {
  createBackgroundWorkerService,
  type BackgroundWorkerService,
} from '../services/background-worker-service';

interface BackgroundWorkerPluginOptions {
  enabled?: boolean;
  intervalMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    backgroundWorkerHostService: BackgroundWorkerHostService;
    backgroundWorkerService: BackgroundWorkerService;
    kanbanEventService: KanbanEventService;
  }
}

const backgroundWorkerPlugin: FastifyPluginAsync<
  BackgroundWorkerPluginOptions
> = async (fastify, options) => {
  const kanbanEventService = createKanbanEventService();
  const backgroundWorkerService = createBackgroundWorkerService({
    callbacks: {
      async createSession(task) {
        const useProvider = fastify.acpRuntime.isConfigured(task.agentId);
        const session = await createAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          {
            actorUserId: 'desktop-user',
            goal: task.title,
            projectId: task.projectId,
            provider: useProvider ? task.agentId : null,
            specialistId: useProvider ? undefined : task.agentId,
            taskId: task.taskId,
          },
          {
            logger: fastify.log,
            source: 'background_worker_create_session',
          },
        );

        return {
          sessionId: session.id,
        };
      },
      async isSessionActive(sessionId) {
        return fastify.acpRuntime.isSessionActive(sessionId);
      },
      async promptSession(task, sessionId) {
        await promptAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          task.projectId,
          sessionId,
          {
            prompt: task.prompt,
          },
          {
            logger: fastify.log,
            source: 'background_worker_prompt_session',
          },
        );
      },
    },
    events: kanbanEventService,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  const backgroundWorkerHostService = createBackgroundWorkerHostService({
    intervalMs: options.intervalMs,
    logger: fastify.log,
    tick: async () => {
      const dispatched = await backgroundWorkerService.dispatchPending();
      const completed = await backgroundWorkerService.checkCompletions();

      return {
        completed,
        dispatched,
      };
    },
  });

  fastify.decorate('kanbanEventService', kanbanEventService);
  fastify.decorate('backgroundWorkerService', backgroundWorkerService);
  fastify.decorate('backgroundWorkerHostService', backgroundWorkerHostService);

  if (options.enabled !== false) {
    fastify.addHook('onReady', async () => {
      backgroundWorkerHostService.start();
    });
  }

  fastify.addHook('onClose', async () => {
    backgroundWorkerHostService.stop();
  });
};

export default fp(backgroundWorkerPlugin, {
  name: 'background-worker',
  dependencies: ['sqlite', 'acp-stream', 'acp-runtime'],
});
