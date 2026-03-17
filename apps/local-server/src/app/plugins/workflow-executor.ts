import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  createWorkflowExecutorService,
  type WorkflowExecutorService,
} from '../services/workflow-executor-service';

declare module 'fastify' {
  interface FastifyInstance {
    workflowExecutorService: WorkflowExecutorService;
  }
}

const workflowExecutorPlugin: FastifyPluginAsync = async (fastify) => {
  const workflowExecutorService = createWorkflowExecutorService({
    events: fastify.kanbanEventService,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  fastify.decorate('workflowExecutorService', workflowExecutorService);

  fastify.addHook('onReady', async () => {
    workflowExecutorService.start();
  });

  fastify.addHook('onClose', async () => {
    workflowExecutorService.stop();
  });
};

export default fp(workflowExecutorPlugin, {
  name: 'workflow-executor',
  dependencies: ['background-worker', 'sqlite'],
});
