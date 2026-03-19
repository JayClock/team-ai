import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { getBackgroundTaskById } from '../services/background-task-service';
import { getProjectKanbanBoardById } from '../services/kanban-board-service';
import { createKanbanEventService, type KanbanEventService } from '../services/kanban-event-service';
import {
  createAcpSessionExecutionBoundary,
} from '../services/acp-session-execution-boundary-service';
import {
  markTaskLaneSessionStatus,
  upsertTaskLaneSession,
} from '../services/task-lane-service';
import { getTaskById, updateTask } from '../services/task-service';
import {
  createBackgroundWorkerHostService,
  type BackgroundWorkerHostService,
} from '../services/background-worker-host-service';
import {
  createBackgroundWorkerService,
  type BackgroundWorkerService,
} from '../services/background-worker-service';
import { listAcpSessionHistory } from '../services/acp-service';
import { resolveBackgroundTaskFlowExecution } from '../services/flow-runtime-service';
import { getSpecialistById } from '../services/specialist-service';

interface BackgroundWorkerPluginOptions {
  enabled?: boolean;
  intervalMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    backgroundWorkerHostService: BackgroundWorkerHostService;
    backgroundWorkerService: BackgroundWorkerService;
    kanbanEventService: KanbanEventService;
  }
}

const backgroundWorkerPlugin: FastifyPluginAsync<
  BackgroundWorkerPluginOptions
> = async (fastify, options) => {
  const kanbanEventService = createKanbanEventService();
  const executionBoundary = createAcpSessionExecutionBoundary({
    broker: fastify.acpStreamBroker,
    logger: fastify.log,
    runtime: fastify.acpRuntime,
    sqlite: fastify.sqlite,
  });

  async function syncTaskLaneSessionStart(
    taskId: string,
    session: Awaited<ReturnType<typeof executionBoundary.createSession>>,
  ) {
    const linkedTask = await getTaskById(fastify.sqlite, taskId).catch(() => null);
    if (!linkedTask) {
      return;
    }

    const board = linkedTask.boardId
      ? await getProjectKanbanBoardById(
          fastify.sqlite,
          linkedTask.projectId,
          linkedTask.boardId,
        ).catch(() => null)
      : null;
    const columnName =
      board?.columns.find((column) => column.id === linkedTask.columnId)?.name;

    upsertTaskLaneSession(linkedTask, {
      columnId: linkedTask.columnId ?? undefined,
      columnName,
      provider: session.provider,
      role: linkedTask.assignedRole ?? undefined,
      sessionId: session.id,
      specialistId: linkedTask.assignedSpecialistId ?? session.specialistId ?? undefined,
      specialistName: linkedTask.assignedSpecialistName ?? undefined,
      startedAt: session.startedAt ?? undefined,
      status: 'running',
    });

    await updateTask(fastify.sqlite, linkedTask.id, {
      laneSessions: linkedTask.laneSessions,
      triggerSessionId: session.id,
    });
  }

  async function syncTaskLaneSessionCompletion(
    backgroundTaskId: string,
    success: boolean,
  ) {
    const backgroundTask = await getBackgroundTaskById(
      fastify.sqlite,
      backgroundTaskId,
    ).catch(() => null);
    if (!backgroundTask?.taskId || !backgroundTask.resultSessionId) {
      return;
    }

    const linkedTask = await getTaskById(
      fastify.sqlite,
      backgroundTask.taskId,
    ).catch(() => null);
    if (!linkedTask) {
      return;
    }

    const updatedLaneSession = markTaskLaneSessionStatus(
      linkedTask,
      backgroundTask.resultSessionId,
      success ? 'completed' : 'failed',
    );
    if (!updatedLaneSession) {
      return;
    }

    await updateTask(fastify.sqlite, linkedTask.id, {
      laneSessions: linkedTask.laneSessions,
      resultSessionId: backgroundTask.resultSessionId,
    });
  }

  const unsubscribeKanbanEvents = kanbanEventService.subscribe(async (event) => {
    if (event.type !== 'background-task.completed') {
      return;
    }

    try {
      await syncTaskLaneSessionCompletion(
        event.backgroundTaskId,
        event.success,
      );
    } catch (error) {
      fastify.log.error(
        {
          backgroundTaskId: event.backgroundTaskId,
          error,
          taskId: event.taskId,
        },
        'Failed to sync task lane session completion',
      );
    }
  });

  const backgroundWorkerService = createBackgroundWorkerService({
    callbacks: {
      async createSession(task) {
        const linkedTask = task.taskId
          ? await getTaskById(fastify.sqlite, task.taskId).catch(() => null)
          : null;
        const flowExecution = await resolveBackgroundTaskFlowExecution(
          fastify.sqlite,
          task,
        );
        const resolvedSpecialistId =
          linkedTask?.assignedSpecialistId ?? task.specialistId ?? null;
        const specialist = resolvedSpecialistId
          ? await getSpecialistById(
              fastify.sqlite,
              task.projectId,
              resolvedSpecialistId,
            ).catch(() => null)
          : null;
        const directProviderId = await executionBoundary.isProviderAvailable(
          task.agentId,
        )
          ? task.agentId
          : null;
        const fallbackProviderId =
          !directProviderId && specialist?.defaultAdapter
            ? await executionBoundary.isProviderAvailable(
                specialist.defaultAdapter,
              )
              ? specialist.defaultAdapter
              : null
            : null;
        const providerId = directProviderId ?? fallbackProviderId;
        const session = await executionBoundary.createSession(
          {
            actorUserId: 'desktop-user',
            codebaseId: linkedTask?.codebaseId ?? null,
            goal: task.title,
            model: flowExecution?.modelOverride ?? null,
            role: linkedTask?.assignedRole ?? specialist?.role ?? null,
            projectId: task.projectId,
            provider: providerId,
            specialistId:
              resolvedSpecialistId ?? (providerId ? undefined : task.agentId),
            taskId: task.taskId,
            worktreeId: linkedTask?.worktreeId ?? null,
          },
          {
            source: 'background_worker_create_session',
          },
        );

        if (task.taskId) {
          try {
            await syncTaskLaneSessionStart(task.taskId, session);
            await kanbanEventService.emit({
              backgroundTaskId: task.id,
              boardId: linkedTask?.boardId ?? null,
              projectId: task.projectId,
              sessionId: session.id,
              taskId: task.taskId,
              taskTitle: linkedTask?.title ?? task.title,
              type: 'background-task.session-started',
            });
          } catch (error) {
            fastify.log.error(
              {
                sessionId: session.id,
                taskId: task.taskId,
                error,
              },
              'Failed to sync task lane session start',
            );
          }
        }

        return {
          sessionId: session.id,
        };
      },
      async isSessionActive(sessionId) {
        return fastify.acpRuntime.isSessionActive(sessionId);
      },
      async promptSession(task, sessionId) {
        const flowExecution = await resolveBackgroundTaskFlowExecution(
          fastify.sqlite,
          task,
        );
        await executionBoundary.promptSession(
          task.projectId,
          sessionId,
          {
            prompt: flowExecution?.prompt ?? task.prompt,
          },
          {
            source: 'background_worker_prompt_session',
          },
        );

        const history = await listAcpSessionHistory(
          fastify.sqlite,
          task.projectId,
          sessionId,
          200,
        );
        const latestAssistantMessage = [...history]
          .reverse()
          .find(
            (event) =>
              event.update.message?.role === 'assistant' &&
              event.update.message.content?.trim(),
          );

        return {
          taskOutput: latestAssistantMessage?.update.message?.content?.trim() ?? null,
        };
      },
    },
    events: kanbanEventService,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  const backgroundWorkerHostService = createBackgroundWorkerHostService({
    intervalMs: options.intervalMs,
    logger: fastify.log,
    tick: async () => {
      const dispatched = await backgroundWorkerService.dispatchPending();
      const completed = await backgroundWorkerService.checkCompletions();

      return {
        completed,
        dispatched,
      };
    },
  });

  fastify.decorate('kanbanEventService', kanbanEventService);
  fastify.decorate('backgroundWorkerService', backgroundWorkerService);
  fastify.decorate('backgroundWorkerHostService', backgroundWorkerHostService);

  if (options.enabled !== false) {
    fastify.addHook('onReady', async () => {
      backgroundWorkerHostService.start();
    });
  }

  fastify.addHook('onClose', async () => {
    unsubscribeKanbanEvents();
    backgroundWorkerHostService.stop();
  });
};

export default fp(backgroundWorkerPlugin, {
  name: 'background-worker',
  dependencies: ['sqlite', 'acp-stream', 'acp-runtime'],
});
