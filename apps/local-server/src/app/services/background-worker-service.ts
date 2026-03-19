import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '@orchestration/runtime-acp';
import type { BackgroundTaskPayload } from '../schemas/background-task';
import type { KanbanEventService } from './kanban-event-service';
import {
  findBackgroundTaskBySessionId,
  listReadyBackgroundTasks,
  listRunningBackgroundTasks,
  updateBackgroundTaskStatus,
} from './background-task-service';
import { getTaskById } from './task-service';

export interface BackgroundWorkerCallbacks {
  createSession(task: BackgroundTaskPayload): Promise<{ sessionId: string }>;
  isSessionActive(sessionId: string): Promise<boolean>;
  promptSession(
    task: BackgroundTaskPayload,
    sessionId: string,
  ): Promise<{ taskOutput?: string | null } | void>;
}

export interface BackgroundWorkerService {
  checkCompletions(): Promise<BackgroundTaskPayload[]>;
  dispatchPending(limit?: number): Promise<BackgroundTaskPayload[]>;
}

interface CreateBackgroundWorkerInput {
  callbacks: BackgroundWorkerCallbacks;
  events: KanbanEventService;
  logger?: DiagnosticLogger;
  sqlite: Database;
  staleAfterMs?: number;
}

export function createBackgroundWorkerService(
  input: CreateBackgroundWorkerInput,
): BackgroundWorkerService {
  const staleAfterMs = input.staleAfterMs ?? 15 * 60 * 1000;

  function isTaskStale(task: BackgroundTaskPayload) {
    const referenceTime =
      task.lastActivityAt ?? task.startedAt ?? task.createdAt;
    const referenceTimestamp = new Date(referenceTime).getTime();

    if (!Number.isFinite(referenceTimestamp)) {
      return false;
    }

    return Date.now() - referenceTimestamp >= staleAfterMs;
  }

  async function emitCompletionEvent(
    task: BackgroundTaskPayload,
    success: boolean,
  ) {
    if (!task.taskId) {
      return;
    }

    const linkedTask = await getTaskById(input.sqlite, task.taskId).catch(() => null);

    await input.events.emit({
      backgroundTaskId: task.id,
      boardId: linkedTask?.boardId ?? null,
      projectId: task.projectId,
      sessionId: task.resultSessionId,
      success,
      taskId: task.taskId,
      taskTitle: linkedTask?.title ?? null,
      type: 'background-task.completed',
    });
  }

  async function dispatchTask(task: BackgroundTaskPayload) {
    const startedTask = await updateBackgroundTaskStatus(
      input.sqlite,
      task.id,
      'RUNNING',
      {
        startedAt: new Date().toISOString(),
      },
    );

    let sessionId: string | null = null;

    try {
      const createdSession = await input.callbacks.createSession(startedTask);
      sessionId = createdSession.sessionId;

      const runningTask = await updateBackgroundTaskStatus(
        input.sqlite,
        task.id,
        'RUNNING',
        {
          lastActivityAt: new Date().toISOString(),
          resultSessionId: sessionId,
          startedAt: startedTask.startedAt,
        },
      );

      const promptResult = await input.callbacks.promptSession(
        runningTask,
        sessionId,
      );

      const completedTask = await updateBackgroundTaskStatus(
        input.sqlite,
        task.id,
        'COMPLETED',
        {
          completedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          resultSessionId: sessionId,
          startedAt: startedTask.startedAt,
          taskOutput: promptResult?.taskOutput ?? null,
        },
      );

      await emitCompletionEvent(completedTask, true);
      return completedTask;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      input.logger?.error?.(
        {
          backgroundTaskId: task.id,
          errorMessage,
        },
        'Background task dispatch failed',
      );

      const failedTask = await updateBackgroundTaskStatus(
        input.sqlite,
        task.id,
        'FAILED',
        {
          completedAt: new Date().toISOString(),
          errorMessage,
          resultSessionId: sessionId,
          startedAt: startedTask.startedAt,
        },
      );

      await emitCompletionEvent(failedTask, false);
      return failedTask;
    }
  }

  return {
    async dispatchPending(limit = 2) {
      const readyTasks = await listReadyBackgroundTasks(input.sqlite);
      const runningTasks = await listRunningBackgroundTasks(input.sqlite);
      const availableSlots = Math.max(0, limit - runningTasks.length);

      if (availableSlots === 0) {
        return [];
      }

      const dispatched: BackgroundTaskPayload[] = [];
      for (const task of readyTasks.slice(0, availableSlots)) {
        dispatched.push(await dispatchTask(task));
      }

      return dispatched;
    },

    async checkCompletions() {
      const runningTasks = await listRunningBackgroundTasks(input.sqlite);
      const completed: BackgroundTaskPayload[] = [];

      for (const task of runningTasks) {
        if (!task.resultSessionId) {
          if (!isTaskStale(task)) {
            continue;
          }

          const orphanedTask = await updateBackgroundTaskStatus(
            input.sqlite,
            task.id,
            'FAILED',
            {
              completedAt: new Date().toISOString(),
              errorMessage:
                task.errorMessage ??
                'Background task lost its execution session binding',
            },
          );
          completed.push(orphanedTask);
          await emitCompletionEvent(orphanedTask, false);
          continue;
        }

        const sessionActive = await input.callbacks.isSessionActive(
          task.resultSessionId,
        );
        if (sessionActive) {
          if (!isTaskStale(task)) {
            continue;
          }

          const staleTask = await updateBackgroundTaskStatus(
            input.sqlite,
            task.id,
            'FAILED',
            {
              completedAt: new Date().toISOString(),
              errorMessage:
                task.errorMessage ??
                'Background task exceeded the stale execution threshold',
            },
          );
          completed.push(staleTask);
          await emitCompletionEvent(staleTask, false);
          continue;
        }

        const completedTask = await updateBackgroundTaskStatus(
          input.sqlite,
          task.id,
          'COMPLETED',
          {
            completedAt: new Date().toISOString(),
          },
        );
        completed.push(completedTask);
        await emitCompletionEvent(completedTask, true);
      }

      return completed;
    },
  };
}

export async function completeBackgroundTaskForSession(
  sqlite: Database,
  events: KanbanEventService,
  sessionId: string,
  success = true,
) {
  const task = await findBackgroundTaskBySessionId(sqlite, sessionId);
  if (!task) {
    return null;
  }

  const completedTask = await updateBackgroundTaskStatus(
    sqlite,
    task.id,
    success ? 'COMPLETED' : 'FAILED',
    {
      completedAt: new Date().toISOString(),
      errorMessage: success ? null : task.errorMessage ?? 'Background task failed',
    },
  );

  if (completedTask.taskId) {
    const linkedTask = await getTaskById(sqlite, completedTask.taskId).catch(
      () => null,
    );
    await events.emit({
      backgroundTaskId: completedTask.id,
      boardId: linkedTask?.boardId ?? null,
      projectId: completedTask.projectId,
      sessionId: completedTask.resultSessionId,
      success,
      taskId: completedTask.taskId,
      taskTitle: linkedTask?.title ?? null,
      type: 'background-task.completed',
    });
  }

  return completedTask;
}
