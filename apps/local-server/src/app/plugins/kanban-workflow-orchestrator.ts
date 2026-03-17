import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  createKanbanWorkflowOrchestrator,
  type KanbanWorkflowOrchestrator,
} from '../services/kanban-workflow-orchestrator-service';

declare module 'fastify' {
  interface FastifyInstance {
    kanbanWorkflowOrchestrator: KanbanWorkflowOrchestrator;
  }
}

const kanbanWorkflowOrchestratorPlugin: FastifyPluginAsync = async (
  fastify,
) => {
  const orchestrator = createKanbanWorkflowOrchestrator({
    events: fastify.kanbanEventService,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  fastify.decorate('kanbanWorkflowOrchestrator', orchestrator);

  fastify.addHook('onReady', async () => {
    orchestrator.start();
  });

  fastify.addHook('onClose', async () => {
    orchestrator.stop();
  });
};

export default fp(kanbanWorkflowOrchestratorPlugin, {
  name: 'kanban-workflow-orchestrator',
  dependencies: ['background-worker', 'sqlite'],
});
