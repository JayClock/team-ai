import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  createTaskWorkflowOrchestrator,
  type TaskWorkflowOrchestrator,
} from '../services/task-workflow-orchestrator-service';

declare module 'fastify' {
  interface FastifyInstance {
    taskWorkflowOrchestrator: TaskWorkflowOrchestrator;
  }
}

const taskWorkflowOrchestratorPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'taskWorkflowOrchestrator',
    createTaskWorkflowOrchestrator({
      broker: fastify.acpStreamBroker,
      callbackSource: 'task-workflow-orchestrator',
      logger: fastify.log,
      runtime: fastify.acpRuntime,
      sqlite: fastify.sqlite,
    }),
  );
};

export default fp(taskWorkflowOrchestratorPlugin, {
  name: 'task-workflow-orchestrator',
});
