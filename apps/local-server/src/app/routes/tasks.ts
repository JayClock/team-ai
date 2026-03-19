import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentTask, presentTaskList } from '../presenters/task-presenter';
import {
  createKanbanCard,
  moveKanbanCard,
} from '../services/kanban-card-service';
import {
  deleteTask,
  getTaskById,
  listTasks,
  normalizeTaskPositionsInColumn,
  placeTaskInColumn,
  updateTask,
} from '../services/task-service';
import { prepareTaskForColumnTransition } from '../services/task-lane-service';
import { resolveTaskStatusForWorkflowColumn } from '../services/task-workflow-service';
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
  codebaseId: nullableStringSchema.optional(),
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
  worktreeId: nullableStringSchema.optional(),
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
    codebaseId: nullableStringSchema.optional(),
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
    worktreeId: nullableStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const moveTaskBodySchema = z.object({
  boardId: nullableStringSchema,
  columnId: nullableStringSchema,
  expectedUpdatedAt: z.string().trim().min(1).optional(),
  force: z.boolean().optional(),
  policyBypassReason: z.string().trim().min(1).optional(),
  position: z.number().int().optional().nullable(),
});

const tasksRoute: FastifyPluginAsync = async (fastify) => {
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

  fastify.post('/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = taskBodySchema.parse(request.body);
    const { sessionId, ...taskInput } = body;
    const createdTask = await createKanbanCard(
      fastify.sqlite,
      {
        ...taskInput,
        projectId,
        sessionId,
      },
      fastify.hasDecorator('kanbanEventService')
        ? fastify.kanbanEventService
        : undefined,
    );

    reply
      .code(201)
      .header('Location', `/api/tasks/${createdTask.id}`)
      .type(VENDOR_MEDIA_TYPES.task);
    return presentTask(createdTask);
  });

  fastify.get('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(await getTaskById(fastify.sqlite, taskId));
  });

  fastify.patch('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskPatchSchema.parse(request.body);
    const previous = await getTaskById(fastify.sqlite, taskId);
    const nextBoardId =
      body.boardId === undefined ? previous.boardId : body.boardId;
    const nextColumnId =
      body.columnId === undefined ? previous.columnId : body.columnId;
    const nextPatch: Parameters<typeof updateTask>[2] = { ...body };
    const transitionState = {
      boardId: previous.boardId,
      columnId: previous.columnId,
      laneHandoffs: previous.laneHandoffs,
      laneSessions: previous.laneSessions,
      lastSyncError: previous.lastSyncError,
      sessionIds: previous.sessionIds,
      triggerSessionId: previous.triggerSessionId,
    };

    if (
      prepareTaskForColumnTransition(
        transitionState,
        {
          boardId: nextBoardId,
          columnId: nextColumnId,
        },
      )
    ) {
      nextPatch.laneSessions = transitionState.laneSessions;
      nextPatch.lastSyncError = transitionState.lastSyncError;
      nextPatch.sessionIds = transitionState.sessionIds;
      nextPatch.triggerSessionId = transitionState.triggerSessionId;
    }

    if (
      body.status === undefined &&
      (previous.boardId !== nextBoardId || previous.columnId !== nextColumnId)
    ) {
      nextPatch.status = resolveTaskStatusForWorkflowColumn(
        nextColumnId,
        null,
        previous.status,
      );
    }

    const updated = await updateTask(fastify.sqlite, taskId, nextPatch);
    const targetPosition = inputPosition(body.position, updated.position);

    if (
      previous.boardId !== updated.boardId ||
      previous.columnId !== updated.columnId ||
      body.position !== undefined
    ) {
      if (previous.boardId && previous.columnId) {
        normalizeTaskPositionsInColumn(
          fastify.sqlite,
          previous.projectId,
          previous.boardId,
          previous.columnId,
        );
      }

      placeTaskInColumn(fastify.sqlite, {
        boardId: updated.boardId,
        columnId: updated.columnId,
        position: targetPosition,
        projectId: updated.projectId,
        taskId: updated.id,
      });
    }

    const positionedTask =
      previous.boardId !== updated.boardId ||
      previous.columnId !== updated.columnId ||
      body.position !== undefined
        ? await getTaskById(fastify.sqlite, taskId)
        : updated;

    if (
      fastify.hasDecorator('kanbanEventService') &&
      positionedTask.boardId &&
      positionedTask.columnId &&
      (previous.boardId !== positionedTask.boardId ||
        previous.columnId !== positionedTask.columnId)
    ) {
      await fastify.kanbanEventService.emit({
        boardId: positionedTask.boardId,
        fromColumnId: previous.columnId,
        projectId: positionedTask.projectId,
        taskId: positionedTask.id,
        taskTitle: positionedTask.title,
        toColumnId: positionedTask.columnId,
        type: 'task.column-transition',
      });
    }

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(positionedTask);
  });

  fastify.post('/tasks/:taskId/move', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = moveTaskBodySchema.parse(request.body);
    const positionedTask = await moveKanbanCard(
      fastify.sqlite,
      {
        boardId: body.boardId,
        columnId: body.columnId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        force: body.force,
        policyBypassReason: body.policyBypassReason,
        position: body.position,
        taskId,
      },
      fastify.hasDecorator('kanbanEventService')
        ? fastify.kanbanEventService
        : undefined,
    );

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(positionedTask);
  });

  fastify.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    await deleteTask(fastify.sqlite, taskId);
    reply.code(204).send();
  });
};

export default tasksRoute;

function inputPosition(
  requestedPosition: number | null | undefined,
  fallbackPosition: number | null,
) {
  return requestedPosition === undefined ? fallbackPosition : requestedPosition;
}
