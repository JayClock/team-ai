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
import {
  getTraceStats,
  listTraces,
} from '../services/trace-service';
import {
  getWorkflowRunById,
  listRunningWorkflowRunIds,
} from '../services/workflow-service';
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

const orchestrationStatusQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
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
  fastify.get('/background-tasks/status', async (request) => {
    const query = orchestrationStatusQuerySchema.parse(request.query);
    const readyTasks = (await listReadyBackgroundTasks(fastify.sqlite)).filter(
      (task) => !query.projectId || task.projectId === query.projectId,
    );
    const runningTasks = (
      await listRunningBackgroundTasks(fastify.sqlite)
    ).filter((task) => !query.projectId || task.projectId === query.projectId);
    const activeAutomations = fastify.hasDecorator('kanbanWorkflowOrchestrator')
      ? fastify.kanbanWorkflowOrchestrator
          .getActiveAutomations()
          .filter(
            (automation) =>
              !query.projectId || automation.projectId === query.projectId,
          )
      : [];
    const queuedAutomations = fastify.hasDecorator('kanbanWorkflowOrchestrator')
      ? fastify.kanbanWorkflowOrchestrator
          .getQueuedAutomations()
          .filter(
            (automation) =>
              !query.projectId || automation.projectId === query.projectId,
          )
      : [];
    const runningWorkflowRuns = listRunningWorkflowRunIds(fastify.sqlite)
      .map((workflowRunId) => getWorkflowRunById(fastify.sqlite, workflowRunId))
      .filter(
        (workflowRun) =>
          !query.projectId || workflowRun.projectId === query.projectId,
      );
    const traceStats = await getTraceStats(fastify.sqlite, {
      projectId: query.projectId,
      sessionId: query.sessionId,
    });
    const recentOrchestrationTraces = (
      await listTraces(fastify.sqlite, {
        eventType: 'orchestration_update',
        limit: 8,
        projectId: query.projectId,
        sessionId: query.sessionId,
      })
    ).items;

    return {
      backgroundWorker: {
        readyTasks: readyTasks.map((task) => ({
          id: task.id,
          projectId: task.projectId,
          status: task.status,
          taskId: task.taskId,
          title: task.title,
          triggerSource: task.triggerSource,
        })),
        readyTaskCount: readyTasks.length,
        readyTaskIds: readyTasks.map((task) => task.id),
        running: fastify.hasDecorator('backgroundWorkerHostService')
          ? fastify.backgroundWorkerHostService.isRunning()
          : false,
        runningTasks: runningTasks.map((task) => ({
          id: task.id,
          projectId: task.projectId,
          resultSessionId: task.resultSessionId,
          startedAt: task.startedAt,
          status: task.status,
          taskId: task.taskId,
          title: task.title,
          triggerSource: task.triggerSource,
        })),
        runningTaskCount: runningTasks.length,
        runningTaskIds: runningTasks.map((task) => task.id),
      },
      kanban: {
        activeAutomationCount: activeAutomations.length,
        activeAutomations,
        activeTaskIds: activeAutomations.map((automation) => automation.taskId),
        queuedAutomations,
        queuedAutomationCount: queuedAutomations.length,
        queuedTaskIds: queuedAutomations.map((automation) => automation.taskId),
      },
      traces: {
        byEventType: traceStats.byEventType,
        recentOrchestrationTraces: recentOrchestrationTraces.map((trace) => ({
          createdAt: trace.createdAt,
          eventName:
            typeof trace.payload.orchestration === 'object' &&
            trace.payload.orchestration &&
            typeof trace.payload.orchestration.eventName === 'string'
              ? trace.payload.orchestration.eventName
              : null,
          id: trace.id,
          sessionId: trace.sessionId,
          summary: trace.summary,
        })),
        totalCount: traceStats.total,
        uniqueSessions: traceStats.uniqueSessions,
      },
      workflows: {
        runningRunCount: runningWorkflowRuns.length,
        runningRunIds: runningWorkflowRuns.map((workflowRun) => workflowRun.id),
        runningRuns: runningWorkflowRuns,
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
