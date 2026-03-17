import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import type { KanbanColumnPayload } from '../schemas/kanban';
import type { TaskPayload } from '../schemas/task';
import type {
  KanbanEventService,
  TaskColumnTransitionEvent,
  TaskSessionCompletedEvent,
} from './kanban-event-service';
import {
  createKanbanSessionQueueService,
  type ActiveKanbanSessionAutomation,
  type KanbanSessionQueueTaskState,
  type QueuedKanbanSessionAutomation,
} from './kanban-session-queue-service';
import { getProjectKanbanBoardById } from './kanban-board-service';
import { listProjectCodebases } from './project-codebase-service';
import { ensureTaskExecutionWorktree } from './task-session-runtime-service';
import { getTaskById, updateTask } from './task-service';

export type {
  ActiveKanbanSessionAutomation as ActiveKanbanAutomation,
  QueuedKanbanSessionAutomation as QueuedKanbanAutomation,
};

export interface KanbanWorkflowOrchestrator {
  getActiveAutomations(): ActiveKanbanSessionAutomation[];
  getQueuedAutomations(): QueuedKanbanSessionAutomation[];
  start(): void;
  stop(): void;
}

export interface KanbanTaskSessionCallbacks {
  cancelTaskSession?(
    task: TaskPayload,
    sessionId: string,
  ): Promise<void>;
  startTaskSession(
    task: TaskPayload,
    column: KanbanColumnPayload,
  ): Promise<{ error?: string; sessionId?: string | null }>;
}

interface CreateKanbanWorkflowOrchestratorInput {
  boardConcurrency?: number;
  callbacks: KanbanTaskSessionCallbacks;
  events: KanbanEventService;
  logger?: DiagnosticLogger;
  sqlite: Database;
}

function deriveStatusForColumn(column: KanbanColumnPayload, task: TaskPayload) {
  const normalized = `${column.id} ${column.name}`.toLowerCase();

  if (normalized.includes('done')) {
    return 'COMPLETED';
  }

  if (normalized.includes('review')) {
    return 'PENDING';
  }

  if (normalized.includes('dev')) {
    return 'READY';
  }

  if (normalized.includes('todo') || normalized.includes('backlog')) {
    return 'PENDING';
  }

  return task.status;
}

function deriveRoleForColumn(
  column: KanbanColumnPayload,
  task: TaskPayload,
): string | null {
  if (task.assignedRole) {
    return task.assignedRole;
  }

  const normalized = `${column.id} ${column.name}`.toLowerCase();
  if (normalized.includes('review') || normalized.includes('verify')) {
    return 'GATE';
  }

  if (normalized.includes('dev')) {
    return 'CRAFTER';
  }

  return task.assignedRole;
}

function requiresTaskWorktree(column: KanbanColumnPayload) {
  const normalized = `${column.id} ${column.name}`.toLowerCase();
  return normalized.includes('dev');
}

async function resolveDefaultCodebaseId(
  sqlite: Database,
  projectId: string,
): Promise<string | null> {
  const codebases = await listProjectCodebases(sqlite, projectId);
  const defaultCodebase =
    codebases.items.find((item) => item.isDefault) ?? codebases.items[0];
  return defaultCodebase?.id ?? null;
}

async function prepareTaskForColumnAutomation(
  sqlite: Database,
  task: TaskPayload,
  column: KanbanColumnPayload,
  logger?: DiagnosticLogger,
) {
  const patch: Parameters<typeof updateTask>[2] = {
    assignedRole: deriveRoleForColumn(column, task),
    boardId: column.boardId,
    columnId: column.id,
    status: deriveStatusForColumn(column, task),
  };

  if (requiresTaskWorktree(column) && !task.codebaseId) {
    const defaultCodebaseId = await resolveDefaultCodebaseId(sqlite, task.projectId);
    if (defaultCodebaseId) {
      patch.codebaseId = defaultCodebaseId;
      patch.codebaseIds = [defaultCodebaseId, ...task.codebaseIds];
    }
  }

  const preparedTask =
    patch.assignedRole !== task.assignedRole ||
    patch.status !== task.status ||
    patch.codebaseId !== undefined
      ? await updateTask(sqlite, task.id, patch)
      : task;

  if (!requiresTaskWorktree(column)) {
    return {
      queueAutomation: true,
      task: preparedTask,
    };
  }

  const worktreeReadyTask = await ensureTaskExecutionWorktree(
    sqlite,
    preparedTask,
    logger,
  );

  return {
    queueAutomation: !worktreeReadyTask.errorMessage,
    task: worktreeReadyTask.task,
  };
}

async function getTaskQueueState(
  sqlite: Database,
  taskId: string,
): Promise<KanbanSessionQueueTaskState | null> {
  const task = await getTaskById(sqlite, taskId).catch(() => null);
  if (!task) {
    return null;
  }

  return {
    boardId: task.boardId,
    columnId: task.columnId,
    triggerSessionId: task.triggerSessionId,
  };
}

export function createKanbanWorkflowOrchestrator(
  input: CreateKanbanWorkflowOrchestratorInput,
): KanbanWorkflowOrchestrator {
  const sessionQueue = createKanbanSessionQueueService({
    boardConcurrency: input.boardConcurrency,
  });
  const processedCompletionEvents = new Set<string>();
  let unsubscribe: (() => void) | null = null;

  async function queueColumnTransition(event: TaskColumnTransitionEvent) {
    const invalidated = await sessionQueue.invalidateTask(event.taskId);
    if (invalidated?.sessionId) {
      const task = await getTaskById(input.sqlite, event.taskId).catch(() => null);
      if (task) {
        await input.callbacks.cancelTaskSession?.(task, invalidated.sessionId);
      }
    }

    const board = await getProjectKanbanBoardById(
      input.sqlite,
      event.projectId,
      event.boardId,
    );
    const targetColumn = board.columns.find(
      (column) => column.id === event.toColumnId,
    );

    if (!targetColumn?.automation?.enabled) {
      return;
    }

    const transitionType = targetColumn.automation.transitionType ?? 'entry';
    if (transitionType !== 'entry' && transitionType !== 'both') {
      return;
    }

    await sessionQueue.enqueue({
      autoAdvanceOnSuccess: targetColumn.automation.autoAdvanceOnSuccess,
      boardId: board.id,
      columnId: targetColumn.id,
      getTaskState: async () => getTaskQueueState(input.sqlite, event.taskId),
      projectId: event.projectId,
      start: async () => {
        const currentTask = await getTaskById(input.sqlite, event.taskId);
        if (currentTask.boardId !== board.id || currentTask.columnId !== targetColumn.id) {
          return {
            error: `Task ${currentTask.id} is no longer in column ${targetColumn.id}.`,
          };
        }

        if (currentTask.triggerSessionId) {
          return {
            sessionId: currentTask.triggerSessionId,
          };
        }

        const prepared = await prepareTaskForColumnAutomation(
          input.sqlite,
          currentTask,
          targetColumn,
          input.logger,
        );
        if (!prepared.queueAutomation) {
          return {
            error: prepared.task.lastSyncError ?? 'Task is not ready for Kanban automation.',
          };
        }

        input.logger?.info?.(
          {
            boardId: board.id,
            columnId: targetColumn.id,
            taskId: prepared.task.id,
          },
          'Starting Kanban task session',
        );

        return await input.callbacks.startTaskSession(prepared.task, targetColumn);
      },
      taskId: event.taskId,
      taskTitle: event.taskTitle,
    });
  }

  async function autoAdvanceTask(
    automation: ActiveKanbanSessionAutomation,
    event: TaskSessionCompletedEvent,
  ) {
    const completionKey = `${event.taskId}:${event.sessionId}`;
    if (processedCompletionEvents.has(completionKey)) {
      return;
    }
    processedCompletionEvents.add(completionKey);

    const completedAutomation = await sessionQueue.completeTaskSession(
      automation.taskId,
      event.sessionId,
    );
    if (!completedAutomation) {
      return;
    }

    if (!event.success || !completedAutomation.autoAdvanceOnSuccess) {
      return;
    }

    const board = await getProjectKanbanBoardById(
      input.sqlite,
      automation.projectId,
      automation.boardId,
    );
    const task = await getTaskById(input.sqlite, automation.taskId);

    if (task.columnId !== automation.columnId) {
      return;
    }

    const orderedColumns = board.columns
      .slice()
      .sort((left, right) => left.position - right.position);
    const currentIndex = orderedColumns.findIndex(
      (column) => column.id === automation.columnId,
    );
    const nextColumn = orderedColumns[currentIndex + 1];
    if (!nextColumn) {
      return;
    }

    const updatedTask = await updateTask(input.sqlite, automation.taskId, {
      boardId: board.id,
      columnId: nextColumn.id,
      status: deriveStatusForColumn(nextColumn, task),
    });

    await input.events.emit({
      boardId: board.id,
      fromColumnId: automation.columnId,
      projectId: automation.projectId,
      taskId: updatedTask.id,
      taskTitle: updatedTask.title,
      toColumnId: nextColumn.id,
      type: 'task.column-transition',
    });
  }

  return {
    getActiveAutomations() {
      return sessionQueue.getActiveAutomations();
    },

    getQueuedAutomations() {
      return sessionQueue.getQueuedAutomations();
    },

    start() {
      if (unsubscribe) {
        return;
      }

      unsubscribe = input.events.subscribe(async (event) => {
        if (event.type === 'task.column-transition') {
          await queueColumnTransition(event);
          return;
        }

        if (event.type === 'task.session-completed') {
          const automation = sessionQueue
            .getActiveAutomations()
            .find((active) => active.taskId === event.taskId);
          if (!automation) {
            return;
          }

          await autoAdvanceTask(automation, event);
        }
      });
    },

    stop() {
      unsubscribe?.();
      unsubscribe = null;
      sessionQueue.stop();
      processedCompletionEvents.clear();
    },
  };
}
