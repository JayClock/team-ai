import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '../errors/problem-error';
import {
  presentTaskRun,
  presentTaskRunList,
} from '../presenters/task-run-presenter';
import { createAcpSession, promptAcpSession } from '../services/acp-service';
import {
  createTaskRun,
  getLatestTaskRunByTaskId,
  getRetryableTaskRunById,
  getTaskRunById,
  listTaskRuns,
  updateTaskRun,
} from '../services/task-run-service';
import { getTaskById, updateTaskAndDispatch } from '../services/task-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listTaskRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sessionId: z.string().trim().min(1).optional(),
  status: z
    .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const taskParamsSchema = z.object({
  taskId: z.string().min(1),
});

const taskRunParamsSchema = z.object({
  taskRunId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);

const taskRunBodySchema = z.object({
  kind: z.enum(['implement', 'review', 'verify']).optional(),
  provider: nullableStringSchema.optional(),
  retryOfRunId: nullableStringSchema.optional(),
  role: nullableStringSchema.optional(),
  sessionId: nullableStringSchema.optional(),
  specialistId: nullableStringSchema.optional(),
  startedAt: nullableStringSchema.optional(),
  status: z
    .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
  summary: nullableStringSchema.optional(),
  verificationReport: nullableStringSchema.optional(),
  verificationVerdict: nullableStringSchema.optional(),
});

const taskRunPatchSchema = z
  .object({
    completedAt: nullableStringSchema.optional(),
    provider: nullableStringSchema.optional(),
    retryOfRunId: nullableStringSchema.optional(),
    role: nullableStringSchema.optional(),
    sessionId: nullableStringSchema.optional(),
    specialistId: nullableStringSchema.optional(),
    startedAt: nullableStringSchema.optional(),
    status: z
      .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
      .optional(),
    summary: nullableStringSchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const taskRunsRoute: FastifyPluginAsync = async (fastify) => {
  const dispatchCallbacks = {
    async createSession(input: {
      actorUserId: string;
      goal?: string;
      parentSessionId?: string | null;
      projectId: string;
      provider: string;
      retryOfRunId?: string | null;
      role?: string | null;
      specialistId?: string;
      taskId?: string | null;
    }) {
      const session = await createAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        input,
        {
          logger: fastify.log,
          source: 'task-runs-route',
        },
      );

      return {
        id: session.id,
      };
    },
    async promptSession(input: {
      projectId: string;
      prompt: string;
      sessionId: string;
    }) {
      return await promptAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        input.projectId,
        input.sessionId,
        {
          prompt: input.prompt,
        },
        {
          logger: fastify.log,
          source: 'task-runs-route',
        },
      );
    },
  };

  fastify.get('/projects/:projectId/task-runs', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listTaskRunsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.taskRuns);

    return presentTaskRunList(
      await listTaskRuns(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });

  fastify.get('/tasks/:taskId/runs', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const query = listTaskRunsQuerySchema.parse(request.query);
    const task = await getTaskById(fastify.sqlite, taskId);
    const taskRunList = await listTaskRuns(fastify.sqlite, {
      ...query,
      projectId: task.projectId,
      taskId,
    });

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.taskRuns);

    return presentTaskRunList(taskRunList);
  });

  fastify.post('/tasks/:taskId/runs', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskRunBodySchema.parse(request.body);
    const task = await getTaskById(fastify.sqlite, taskId);
    const taskRun = await createTaskRun(
      fastify.sqlite,
      {
        ...body,
        projectId: task.projectId,
        taskId,
      },
      {
        logger: request.log,
        source: 'task-runs-route',
      },
    );

    reply
      .code(201)
      .header('Location', `/api/task-runs/${taskRun.id}`)
      .type(VENDOR_MEDIA_TYPES.taskRun);
    return presentTaskRun(taskRun);
  });

  fastify.get('/task-runs/:taskRunId', async (request, reply) => {
    const { taskRunId } = taskRunParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.taskRun);

    return presentTaskRun(await getTaskRunById(fastify.sqlite, taskRunId));
  });

  fastify.patch('/task-runs/:taskRunId', async (request, reply) => {
    const { taskRunId } = taskRunParamsSchema.parse(request.params);
    const body = taskRunPatchSchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.taskRun);

    return presentTaskRun(
      await updateTaskRun(fastify.sqlite, taskRunId, body, {
        logger: request.log,
        source: 'task-runs-route',
      }),
    );
  });

  fastify.post('/task-runs/:taskRunId/retry', async (request, reply) => {
    const { taskRunId } = taskRunParamsSchema.parse(request.params);
    const sourceRun = await getRetryableTaskRunById(fastify.sqlite, taskRunId);
    const result = await updateTaskAndDispatch(
      fastify.sqlite,
      sourceRun.taskId,
      {
        status: 'READY',
      },
      {
        callbacks: dispatchCallbacks,
        logger: request.log,
        retryOfRunId: sourceRun.id,
        triggerSource: 'manual',
      },
    );

    if (!result.dispatch.attempted || !result.dispatch.result?.dispatched) {
      const dispatchabilityReasons =
        result.dispatch.result?.dispatchability.reasons.join(', ') ?? null;
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-run-retry-dispatch-blocked',
        title: 'Task Run Retry Dispatch Blocked',
        status: 409,
        detail:
          result.dispatch.errorMessage ??
          (dispatchabilityReasons
            ? `Task run ${taskRunId} could not be retried because ${dispatchabilityReasons}`
            : `Task run ${taskRunId} could not be retried`),
      });
    }

    const retriedRun = await getLatestTaskRunByTaskId(
      fastify.sqlite,
      sourceRun.taskId,
    );

    if (
      !retriedRun ||
      retriedRun.id === sourceRun.id ||
      retriedRun.retryOfRunId !== sourceRun.id
    ) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/task-run-retry-not-created',
        title: 'Task Run Retry Not Created',
        status: 500,
        detail: `Task run ${taskRunId} was retried but no retry run was recorded`,
      });
    }

    reply
      .code(201)
      .header('Location', `/api/task-runs/${retriedRun.id}`)
      .type(VENDOR_MEDIA_TYPES.taskRun);
    return presentTaskRun(retriedRun);
  });
};

export default taskRunsRoute;
