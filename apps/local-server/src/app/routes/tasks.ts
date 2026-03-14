import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentTask, presentTaskList } from '../presenters/task-presenter';
import {
  createAcpSession,
  getAcpSessionById,
  promptAcpSession,
} from '../services/acp-service';
import {
  createTask,
  deleteTask,
  executeTask,
  getTaskById,
  listTasks,
  updateTask,
} from '../services/task-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const sessionParamsSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
});

const taskParamsSchema = z.object({
  taskId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const nullableTaskKindSchema = z.union([
  z.enum(['plan', 'implement', 'review', 'verify']),
  z.null(),
]);

const taskBodySchema = z.object({
  acceptanceCriteria: stringArraySchema.optional(),
  assignedProvider: nullableStringSchema.optional(),
  assignedRole: nullableStringSchema.optional(),
  assignedSpecialistId: nullableStringSchema.optional(),
  assignedSpecialistName: nullableStringSchema.optional(),
  assignee: nullableStringSchema.optional(),
  boardId: nullableStringSchema.optional(),
  columnId: nullableStringSchema.optional(),
  completionSummary: nullableStringSchema.optional(),
  dependencies: stringArraySchema.optional(),
  githubId: nullableStringSchema.optional(),
  githubNumber: z.number().int().optional().nullable(),
  githubRepo: nullableStringSchema.optional(),
  githubState: nullableStringSchema.optional(),
  githubSyncedAt: nullableStringSchema.optional(),
  githubUrl: nullableStringSchema.optional(),
  kind: nullableTaskKindSchema.optional(),
  labels: stringArraySchema.optional(),
  lastSyncError: nullableStringSchema.optional(),
  objective: z.string().trim().min(1),
  parallelGroup: nullableStringSchema.optional(),
  parentTaskId: nullableStringSchema.optional(),
  position: z.number().int().optional().nullable(),
  priority: nullableStringSchema.optional(),
  scope: nullableStringSchema.optional(),
  status: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  verificationCommands: stringArraySchema.optional(),
  verificationReport: nullableStringSchema.optional(),
  verificationVerdict: nullableStringSchema.optional(),
});

const taskPatchSchema = z
  .object({
    acceptanceCriteria: stringArraySchema.optional(),
    assignedProvider: nullableStringSchema.optional(),
    assignedRole: nullableStringSchema.optional(),
    assignedSpecialistId: nullableStringSchema.optional(),
    assignedSpecialistName: nullableStringSchema.optional(),
    assignee: nullableStringSchema.optional(),
    boardId: nullableStringSchema.optional(),
    columnId: nullableStringSchema.optional(),
    completionSummary: nullableStringSchema.optional(),
    dependencies: stringArraySchema.optional(),
    githubId: nullableStringSchema.optional(),
    githubNumber: z.number().int().optional().nullable(),
    githubRepo: nullableStringSchema.optional(),
    githubState: nullableStringSchema.optional(),
    githubSyncedAt: nullableStringSchema.optional(),
    githubUrl: nullableStringSchema.optional(),
    kind: nullableTaskKindSchema.optional(),
    labels: stringArraySchema.optional(),
    lastSyncError: nullableStringSchema.optional(),
    objective: z.string().trim().min(1).optional(),
    parallelGroup: nullableStringSchema.optional(),
    parentTaskId: nullableStringSchema.optional(),
    position: z.number().int().optional().nullable(),
    priority: nullableStringSchema.optional(),
    scope: nullableStringSchema.optional(),
    status: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    triggerSessionId: z.union([z.string().trim().min(1), z.null()]).optional(),
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const tasksRoute: FastifyPluginAsync = async (fastify) => {
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
          source: 'tasks-route',
        },
      );

      return {
        id: session.id,
      };
    },
    async isProviderAvailable(provider: string) {
      return fastify.acpRuntime.isConfigured(provider);
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
          source: 'tasks-route',
        },
      );
    },
  };

  fastify.get('/tasks', async (request, reply) => {
    const query = listTasksQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.tasks);

    return presentTaskList(await listTasks(fastify.sqlite, query));
  });

  fastify.get('/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listTasksQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.tasks);

    return presentTaskList(
      await listTasks(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });

  fastify.get(
    '/projects/:projectId/acp-sessions/:sessionId/tasks',
    async (request, reply) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(
        request.params,
      );
      const query = listTasksQuerySchema.parse(request.query);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.tasks);

      return presentTaskList(
        await listTasks(fastify.sqlite, {
          ...query,
          projectId,
          sessionId,
        }),
      );
    },
  );

  fastify.post(
    '/projects/:projectId/acp-sessions/:sessionId/tasks',
    async (request, reply) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(
        request.params,
      );
      const session = await getAcpSessionById(fastify.sqlite, sessionId);
      if (session.project.id !== projectId) {
        throw fastify.httpErrors.notFound();
      }
      const body = taskBodySchema.parse(request.body);
      const task = await createTask(fastify.sqlite, {
        ...body,
        projectId,
        triggerSessionId: sessionId,
      });

      reply
        .code(201)
        .header('Location', `/api/tasks/${task.id}`)
        .type(VENDOR_MEDIA_TYPES.task);
      return presentTask(task);
    },
  );

  fastify.get('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(await getTaskById(fastify.sqlite, taskId));
  });

  fastify.patch('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskPatchSchema.parse(request.body);
    const task = await updateTask(fastify.sqlite, taskId, body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(task);
  });

  fastify.post('/tasks/:taskId/execute', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const result = await executeTask(fastify.sqlite, taskId, {
      callbacks: dispatchCallbacks,
      logger: request.log,
    });

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(result.task);
  });

  fastify.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    await deleteTask(fastify.sqlite, taskId);
    reply.code(204).send();
  });
};

export default tasksRoute;
