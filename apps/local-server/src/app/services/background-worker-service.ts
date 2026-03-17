import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import type { BackgroundTaskPayload } from '../schemas/background-task';
import type { KanbanEventService } from './kanban-event-service';
import {
  findBackgroundTaskBySessionId,
  listReadyBackgroundTasks,
  listRunningBackgroundTasks,
  updateBackgroundTaskStatus,
} from './background-task-service';

export interface BackgroundWorkerCallbacks {
  createSession(task: BackgroundTaskPayload): Promise<{ sessionId: string }>;
  isSessionActive(sessionId: string): Promise<boolean>;
  promptSession(task: BackgroundTaskPayload, sessionId: string): Promise<void>;
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
}

export function createBackgroundWorkerService(
  input: CreateBackgroundWorkerInput,
): BackgroundWorkerService {
  async function dispatchTask(task: BackgroundTaskPayload) {
    const startedTask = await updateBackgroundTaskStatus(
      input.sqlite,
      task.id,
      'RUNNING',
      {
        startedAt: new Date().toISOString(),
      },
    );

    try {
      const { sessionId } = await input.callbacks.createSession(startedTask);
      await input.callbacks.promptSession(startedTask, sessionId);

      return await updateBackgroundTaskStatus(
        input.sqlite,
        task.id,
        'RUNNING',
        {
          lastActivityAt: new Date().toISOString(),
          resultSessionId: sessionId,
          startedAt: startedTask.startedAt,
        },
      );
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

      return await updateBackgroundTaskStatus(
        input.sqlite,
        task.id,
        'FAILED',
        {
          completedAt: new Date().toISOString(),
          errorMessage,
        },
      );
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
          continue;
        }

        const sessionActive = await input.callbacks.isSessionActive(
          task.resultSessionId,
        );
        if (sessionActive) {
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

        if (completedTask.taskId) {
          await input.events.emit({
            backgroundTaskId: completedTask.id,
            projectId: completedTask.projectId,
            success: true,
            taskId: completedTask.taskId,
            type: 'background-task.completed',
          });
        }
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
    await events.emit({
      backgroundTaskId: completedTask.id,
      projectId: completedTask.projectId,
      success,
      taskId: completedTask.taskId,
      type: 'background-task.completed',
    });
  }

  return completedTask;
}
