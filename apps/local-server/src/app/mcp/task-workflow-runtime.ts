import type { FastifyInstance } from 'fastify';
import { createTaskExecutionRuntime } from '../services/task-execution-runtime-service';
import {
  executeTask,
  patchTaskFromMcpAndMaybeExecute,
  type AutoExecuteTaskPatch,
  type ExecuteTaskOptions,
  type ExecuteTaskResult,
} from '../services/task-orchestration-service';
import {
  dispatchGateTasksForCompletedWave,
  type TaskWaveExecutionOptions,
  type TaskWorkflowWaveResult,
} from '../services/task-wave-service';

export interface TaskWorkflowRuntime {
  dispatchGateTasksForCompletedWave(
    options: TaskWaveExecutionOptions,
  ): Promise<TaskWorkflowWaveResult>;
  executeTask(
    taskId: string,
    options?: Omit<ExecuteTaskOptions, 'callbacks'>,
  ): Promise<ExecuteTaskResult>;
  patchTaskFromMcpAndMaybeExecute(
    taskId: string,
    patch: AutoExecuteTaskPatch,
    options?: Omit<ExecuteTaskOptions, 'callbacks'>,
  ): Promise<Awaited<ReturnType<typeof import('../services/task-service').getTaskById>>>;
}

const workflowByFastify = new WeakMap<FastifyInstance, TaskWorkflowRuntime>();

export function getTaskWorkflowRuntime(
  fastify: FastifyInstance,
): TaskWorkflowRuntime {
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
  const workflow: TaskWorkflowRuntime = {
    async dispatchGateTasksForCompletedWave(options) {
      return await dispatchGateTasksForCompletedWave(
        fastify.sqlite,
        runtime,
        options,
      );
    },
    async executeTask(taskId, options = {}) {
      return await executeTask(fastify.sqlite, taskId, {
        ...options,
        callbacks: runtime,
      });
    },
    async patchTaskFromMcpAndMaybeExecute(taskId, patch, options = {}) {
      return await patchTaskFromMcpAndMaybeExecute(
        fastify.sqlite,
        {
          ...options,
          callbacks: runtime,
          taskId,
        },
        patch,
      );
    },
  };

  workflowByFastify.set(fastify, workflow);
  return workflow;
}
