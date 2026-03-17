import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentBackgroundTask,
  presentBackgroundTaskList,
} from '../presenters/background-task-presenter';
import {
  createBackgroundTask,
  getBackgroundTaskById,
  listBackgroundTasks,
  listReadyBackgroundTasks,
  listRunningBackgroundTasks,
} from '../services/background-task-service';
import { listRunningWorkflowRunIds } from '../services/workflow-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const backgroundTaskParamsSchema = z.object({
  backgroundTaskId: z.string().min(1),
});

const listBackgroundTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['CANCELLED', 'COMPLETED', 'FAILED', 'PENDING', 'RUNNING'])
    .optional(),
});

const createBackgroundTaskBodySchema = z.object({
  agentId: z.string().trim().min(1),
  maxAttempts: z.number().int().positive().optional(),
  priority: z.enum(['HIGH', 'LOW', 'NORMAL']).optional(),
  prompt: z.string().trim().min(1),
  taskId: z.union([z.string().trim().min(1), z.null()]).optional(),
  title: z.string().trim().min(1).optional(),
  triggerSource: z
    .enum(['fleet', 'manual', 'polling', 'schedule', 'webhook', 'workflow'])
    .optional(),
  triggeredBy: z.string().trim().min(1).optional(),
  workflowRunId: z.union([z.string().trim().min(1), z.null()]).optional(),
  workflowStepName: z.union([z.string().trim().min(1), z.null()]).optional(),
});

const backgroundTasksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/background-tasks/status', async () => {
    const readyTasks = await listReadyBackgroundTasks(fastify.sqlite);
    const runningTasks = await listRunningBackgroundTasks(fastify.sqlite);
    const activeAutomations = fastify.hasDecorator('kanbanWorkflowOrchestrator')
      ? fastify.kanbanWorkflowOrchestrator.getActiveAutomations()
      : [];
    const queuedAutomations = fastify.hasDecorator('kanbanWorkflowOrchestrator')
      ? fastify.kanbanWorkflowOrchestrator.getQueuedAutomations()
      : [];
    const runningWorkflowRunIds = listRunningWorkflowRunIds(fastify.sqlite);

    return {
      backgroundWorker: {
        readyTaskCount: readyTasks.length,
        readyTaskIds: readyTasks.map((task) => task.id),
        running: fastify.hasDecorator('backgroundWorkerHostService')
          ? fastify.backgroundWorkerHostService.isRunning()
          : false,
        runningTaskCount: runningTasks.length,
        runningTaskIds: runningTasks.map((task) => task.id),
      },
      kanban: {
        activeAutomationCount: activeAutomations.length,
        activeTaskIds: activeAutomations.map((automation) => automation.taskId),
        queuedAutomationCount: queuedAutomations.length,
        queuedTaskIds: queuedAutomations.map((automation) => automation.taskId),
      },
      workflows: {
        runningRunCount: runningWorkflowRunIds.length,
        runningRunIds: runningWorkflowRunIds,
      },
    };
  });

  fastify.post('/background-tasks/process', async () => {
    const result = await fastify.backgroundWorkerHostService.tickNow();

    return {
      completedCount: result.completed.length,
      completedTaskIds: result.completed.map((task) => task.id),
      dispatchedCount: result.dispatched.length,
      dispatchedTaskIds: result.dispatched.map((task) => task.id),
      running: fastify.backgroundWorkerHostService.isRunning(),
    };
  });

  fastify.get(
    '/projects/:projectId/background-tasks',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = listBackgroundTasksQuerySchema.parse(request.query);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.backgroundTasks);

      return presentBackgroundTaskList(
        await listBackgroundTasks(fastify.sqlite, {
          ...query,
          projectId,
        }),
      );
    },
  );

  fastify.post(
    '/projects/:projectId/background-tasks',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = createBackgroundTaskBodySchema.parse(request.body);
      const backgroundTask = await createBackgroundTask(fastify.sqlite, {
        ...body,
        projectId,
      });

      reply
        .code(201)
        .header('Location', `/api/background-tasks/${backgroundTask.id}`)
        .type(VENDOR_MEDIA_TYPES.backgroundTask);
      return presentBackgroundTask(backgroundTask);
    },
  );

  fastify.get('/background-tasks/:backgroundTaskId', async (request, reply) => {
    const { backgroundTaskId } = backgroundTaskParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.backgroundTask);

    return presentBackgroundTask(
      await getBackgroundTaskById(fastify.sqlite, backgroundTaskId),
    );
  });
};

export default backgroundTasksRoute;
