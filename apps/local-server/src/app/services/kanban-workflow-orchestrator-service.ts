import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '@orchestration/runtime-acp';
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
import {
  evaluateKanbanAutomationStartPolicy,
  getKanbanPolicyViolationMessage,
} from './kanban-policy-service';
import { moveKanbanCard } from './kanban-card-service';
import { listProjectCodebases } from './project-codebase-service';
import { evaluateTaskArtifactGate } from './task-artifact-gate-service';
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
  if (column.stage === 'done') {
    return 'COMPLETED';
  }

  if (column.stage === 'review') {
    return 'PENDING';
  }

  if (column.stage === 'dev') {
    return 'READY';
  }

  if (column.stage === 'todo' || column.stage === 'backlog') {
    return 'PENDING';
  }

  if (column.stage === 'blocked') {
    return 'WAITING_RETRY';
  }

  return task.status;
}

function deriveRoleForColumn(
  column: KanbanColumnPayload,
  task: TaskPayload,
): string | null {
  return (
    column.automation?.role ??
    column.recommendedRole ??
    task.assignedRole
  );
}

function deriveSpecialistIdForColumn(
  column: KanbanColumnPayload,
  task: TaskPayload,
) {
  return (
    column.automation?.specialistId ??
    column.recommendedSpecialistId ??
    task.assignedSpecialistId
  );
}

function deriveSpecialistNameForColumn(
  column: KanbanColumnPayload,
  task: TaskPayload,
) {
  return (
    column.automation?.specialistName ??
    column.recommendedSpecialistName ??
    task.assignedSpecialistName
  );
}

function requiresTaskWorktree(column: KanbanColumnPayload) {
  return column.stage === 'dev';
}

function resolveColumnAfterSuccessfulAutomation(
  columns: KanbanColumnPayload[],
  currentColumnId: string,
  task: TaskPayload,
) {
  const currentColumn = columns.find((column) => column.id === currentColumnId);
  const orderedStages: Array<KanbanColumnPayload['stage']> = [
    'backlog',
    'todo',
    'dev',
    'review',
    'done',
  ];

  if (!currentColumn?.stage) {
    return null;
  }

  if (currentColumn.stage === 'blocked') {
    const previousActiveLane = [...task.laneSessions]
      .reverse()
      .find((entry) => entry.columnId && entry.columnId !== currentColumnId);
    if (previousActiveLane?.columnId) {
      return (
        columns.find((column) => column.id === previousActiveLane.columnId) ?? null
      );
    }

    return columns.find((column) => column.stage === 'todo') ?? null;
  }

  const currentStageIndex = orderedStages.indexOf(currentColumn.stage);
  if (currentStageIndex < 0) {
    return null;
  }

  const nextStage = orderedStages[currentStageIndex + 1];
  if (!nextStage) {
    return null;
  }

  return columns.find((column) => column.stage === nextStage) ?? null;
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
    assignedSpecialistId: deriveSpecialistIdForColumn(column, task),
    assignedSpecialistName: deriveSpecialistNameForColumn(column, task),
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
    patch.assignedSpecialistId !== task.assignedSpecialistId ||
    patch.assignedSpecialistName !== task.assignedSpecialistName ||
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

    const enqueueResult = await sessionQueue.enqueue({
      autoAdvanceOnSuccess: targetColumn.automation.autoAdvanceOnSuccess,
      boardId: board.id,
      canStart: async () => {
        const latestBoard = await getProjectKanbanBoardById(
          input.sqlite,
          event.projectId,
          board.id,
        );
        const latestColumn = latestBoard.columns.find(
          (column) => column.id === targetColumn.id,
        );
        if (!latestColumn) {
          return {
            allowed: false,
            error: `Column ${targetColumn.id} is no longer available.`,
          };
        }

        const violations = evaluateKanbanAutomationStartPolicy({
          board: latestBoard,
          column: latestColumn,
        });
        if (violations.length === 0) {
          return {
            allowed: true,
          };
        }

        return {
          allowed: false,
          error: violations.map((violation) => violation.message).join(' '),
        };
      },
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

    if (enqueueResult.error) {
      await updateTask(input.sqlite, event.taskId, {
        lastSyncError: enqueueResult.error,
      });
    }
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
    const currentColumn = orderedColumns.find(
      (column) => column.id === automation.columnId,
    );
    const nextColumn = resolveColumnAfterSuccessfulAutomation(
      orderedColumns,
      automation.columnId,
      task,
    );
    if (!currentColumn || !nextColumn) {
      return;
    }

    if (currentColumn.stage === 'review' && task.verificationVerdict === 'fail') {
      const fallbackColumn =
        orderedColumns.find((column) => column.stage === 'dev') ??
        orderedColumns.find((column) => column.stage === 'blocked');
      if (!fallbackColumn) {
        return;
      }

      const failedTask = await updateTask(input.sqlite, automation.taskId, {
        boardId: board.id,
        columnId: fallbackColumn.id,
        lastSyncError:
          task.verificationReport ??
          task.lastSyncError ??
          'Review reported changes required.',
        status: deriveStatusForColumn(fallbackColumn, task),
      });

      await input.events.emit({
        boardId: board.id,
        fromColumnId: automation.columnId,
        projectId: automation.projectId,
        taskId: failedTask.id,
        taskTitle: failedTask.title,
        toColumnId: fallbackColumn.id,
        type: 'task.column-transition',
      });
      return;
    }

    const artifactGate = evaluateTaskArtifactGate(
      task,
      currentColumn,
      automation.sessionId ?? task.triggerSessionId,
    );
    if (artifactGate.gated) {
      await updateTask(input.sqlite, automation.taskId, {
        lastSyncError: artifactGate.message,
        verificationReport: artifactGate.message,
        verificationVerdict: 'fail',
      });
      input.logger?.warn?.(
        {
          columnId: currentColumn.id,
          missingArtifacts: artifactGate.missingArtifacts,
          sessionId: automation.sessionId,
          taskId: automation.taskId,
        },
        'Blocked Kanban auto-advance because artifact gate requirements were not satisfied',
      );
      return;
    }

    try {
      await updateTask(input.sqlite, automation.taskId, {
        lastSyncError: null,
      });
      await moveKanbanCard(input.sqlite, {
        boardId: board.id,
        columnId: nextColumn.id,
        taskId: automation.taskId,
      }, input.events);
    } catch (error) {
      const detail = getKanbanPolicyViolationMessage(error);
      await updateTask(input.sqlite, automation.taskId, {
        lastSyncError: detail,
        verificationReport:
          currentColumn.stage === 'review' ? detail : task.verificationReport,
      });
      input.logger?.warn?.(
        {
          boardId: board.id,
          fromColumnId: automation.columnId,
          policyError: detail,
          taskId: automation.taskId,
          toColumnId: nextColumn.id,
        },
        'Blocked Kanban auto-advance because board policy requirements were not satisfied',
      );
    }
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
