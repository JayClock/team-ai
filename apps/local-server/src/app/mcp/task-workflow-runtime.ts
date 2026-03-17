import type { FastifyInstance } from 'fastify';
import { createTaskExecutionRuntime } from '../services/task-execution-runtime-service';
import {
  createTaskWorkflowOrchestrator,
  type TaskWorkflowOrchestrator,
} from '../services/task-workflow-orchestrator-service';

const workflowByFastify = new WeakMap<FastifyInstance, TaskWorkflowOrchestrator>();

export function getTaskWorkflowRuntime(
  fastify: FastifyInstance,
): TaskWorkflowOrchestrator {
  const existing = workflowByFastify.get(fastify);
  if (existing) {
    return existing;
  }

  const runtime = createTaskExecutionRuntime({
    broker: fastify.acpStreamBroker,
    logger: fastify.log,
    runtime: fastify.acpRuntime,
    sqlite: fastify.sqlite,
  });
  const workflow = createTaskWorkflowOrchestrator({
    executionRuntime: runtime,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  workflowByFastify.set(fastify, workflow);
  return workflow;
}
