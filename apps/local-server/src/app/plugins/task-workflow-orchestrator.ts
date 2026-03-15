import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createTaskExecutionRuntime } from '../services/task-execution-runtime-service';
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
  const executionRuntime = createTaskExecutionRuntime({
    broker: fastify.acpStreamBroker,
    logger: fastify.log,
    runtime: fastify.acpRuntime,
    sqlite: fastify.sqlite,
  });

  fastify.decorate(
    'taskWorkflowOrchestrator',
    createTaskWorkflowOrchestrator({
      executionRuntime,
      logger: fastify.log,
      sqlite: fastify.sqlite,
    }),
  );
};

export default fp(taskWorkflowOrchestratorPlugin, {
  name: 'task-workflow-orchestrator',
});
