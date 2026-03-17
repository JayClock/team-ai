import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createAcpSession, promptAcpSession } from '../services/acp-service';
import { getBackgroundTaskById } from '../services/background-task-service';
import { getProjectKanbanBoardById } from '../services/kanban-board-service';
import { createKanbanEventService, type KanbanEventService } from '../services/kanban-event-service';
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

  async function syncTaskLaneSessionStart(taskId: string, session: Awaited<ReturnType<typeof createAcpSession>>) {
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
        const useProvider = fastify.acpRuntime.isConfigured(task.agentId);
        const session = await createAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          {
            actorUserId: 'desktop-user',
            codebaseId: linkedTask?.codebaseId ?? null,
            goal: task.title,
            role: linkedTask?.assignedRole ?? null,
            projectId: task.projectId,
            provider: useProvider ? task.agentId : null,
            specialistId: linkedTask?.assignedSpecialistId ?? (
              useProvider ? undefined : task.agentId
            ),
            taskId: task.taskId,
            worktreeId: linkedTask?.worktreeId ?? null,
          },
          {
            logger: fastify.log,
            source: 'background_worker_create_session',
          },
        );

        if (task.taskId) {
          try {
            await syncTaskLaneSessionStart(task.taskId, session);
            await kanbanEventService.emit({
              backgroundTaskId: task.id,
              projectId: task.projectId,
              sessionId: session.id,
              taskId: task.taskId,
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
        await promptAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          task.projectId,
          sessionId,
          {
            prompt: task.prompt,
          },
          {
            logger: fastify.log,
            source: 'background_worker_prompt_session',
          },
        );
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
