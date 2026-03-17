import type { FastifyInstance } from 'fastify';
import {
  createAcpSessionExecutionBoundary,
  createDispatchTaskCallbacks,
} from '../services/acp-session-execution-boundary-service';
import {
  patchTaskFromMcpAndMaybeExecute,
  type AutoExecuteTaskPatch,
  type ExecuteTaskOptions,
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

  const runtime = createDispatchTaskCallbacks(
    createAcpSessionExecutionBoundary({
      broker: fastify.acpStreamBroker,
      logger: fastify.log,
      runtime: fastify.acpRuntime,
      sqlite: fastify.sqlite,
    }),
    {
      createSessionSource: 'task_execution_runtime_create_session',
      promptSessionSource: 'task_execution_runtime_prompt_session',
    },
  );
  const workflow: TaskWorkflowRuntime = {
    async dispatchGateTasksForCompletedWave(options) {
      return await dispatchGateTasksForCompletedWave(
        fastify.sqlite,
        runtime,
        options,
      );
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
