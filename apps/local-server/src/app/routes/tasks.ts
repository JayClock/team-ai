import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentTask, presentTaskList } from '../presenters/task-presenter';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
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

const taskParamsSchema = z.object({
  taskId: z.string().min(1),
});

const taskExecuteBodySchema = z.object({
  callerSessionId: z.string().trim().min(1).optional(),
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
  sessionId: z.union([z.string().trim().min(1), z.null()]).optional(),
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
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const tasksRoute: FastifyPluginAsync = async (fastify) => {
  const workflow = fastify.taskWorkflowOrchestrator;

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

  fastify.post(
    '/projects/:projectId/tasks',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = taskBodySchema.parse(request.body);
      const { sessionId, ...taskInput } = body;
      const task = await createTask(fastify.sqlite, {
        ...taskInput,
        projectId,
        sessionId,
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
    const executedTask = await workflow.patchTaskAndMaybeExecute(
      taskId,
      body,
      {
        logger: request.log,
        source: 'tasks_route_patch_auto_execute',
      },
    );

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(executedTask);
  });

  fastify.post('/tasks/:taskId/execute', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskExecuteBodySchema.parse(request.body ?? {});
    const result = await workflow.executeTask(taskId, {
      callerSessionId: body.callerSessionId,
      logger: request.log,
      source: 'tasks_route_execute',
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
