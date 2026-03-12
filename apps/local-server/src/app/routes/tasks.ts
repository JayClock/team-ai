import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentTask, presentTaskList } from '../presenters/task-presenter';
import { getAcpSessionById } from '../services/acp-service';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  updateTask,
} from '../services/task-service';

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
  labels: stringArraySchema.optional(),
  lastSyncError: nullableStringSchema.optional(),
  objective: z.string().trim().min(1),
  parallelGroup: nullableStringSchema.optional(),
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
    labels: stringArraySchema.optional(),
    lastSyncError: nullableStringSchema.optional(),
    objective: z.string().trim().min(1).optional(),
    parallelGroup: nullableStringSchema.optional(),
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
  fastify.get('/tasks', async (request) => {
    const query = listTasksQuerySchema.parse(request.query);
    return presentTaskList(await listTasks(fastify.sqlite, query));
  });

  fastify.get('/projects/:projectId/tasks', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listTasksQuerySchema.parse(request.query);
    return presentTaskList(
      await listTasks(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/acp-sessions/:sessionId/tasks', async (request) => {
    const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
    const query = listTasksQuerySchema.parse(request.query);
    return presentTaskList(
      await listTasks(fastify.sqlite, {
        ...query,
        projectId,
        sessionId,
      }),
    );
  });

  fastify.post('/projects/:projectId/acp-sessions/:sessionId/tasks', async (request, reply) => {
    const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
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

    reply.code(201).header('Location', `/api/tasks/${task.id}`);
    return presentTask(task);
  });

  fastify.get('/tasks/:taskId', async (request) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    return presentTask(await getTaskById(fastify.sqlite, taskId));
  });

  fastify.patch('/tasks/:taskId', async (request) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskPatchSchema.parse(request.body);
    return presentTask(await updateTask(fastify.sqlite, taskId, body));
  });

  fastify.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    await deleteTask(fastify.sqlite, taskId);
    reply.code(204).send();
  });
};

export default tasksRoute;
