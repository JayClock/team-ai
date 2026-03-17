import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import type { KanbanColumnPayload } from '../schemas/kanban';
import type { TaskPayload } from '../schemas/task';
import { createBackgroundTask } from './background-task-service';
import { listProjectCodebases } from './project-codebase-service';
import type {
  BackgroundTaskCompletionEvent,
  BackgroundTaskSessionStartedEvent,
  KanbanEventService,
  TaskColumnTransitionEvent,
} from './kanban-event-service';
import { getProjectKanbanBoardById } from './kanban-board-service';
import { ensureTaskExecutionWorktree } from './task-orchestration-service';
import { getTaskById, updateTask } from './task-service';

export interface ActiveKanbanAutomation {
  autoAdvanceOnSuccess: boolean;
  backgroundTaskId: string;
  boardId: string;
  columnId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  triggerSessionId: string | null;
}

export interface QueuedKanbanAutomation {
  boardId: string;
  columnId: string;
  enqueuedAt: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
}

export interface KanbanWorkflowOrchestrator {
  getActiveAutomations(): ActiveKanbanAutomation[];
  getQueuedAutomations(): QueuedKanbanAutomation[];
  start(): void;
  stop(): void;
}

interface CreateKanbanWorkflowOrchestratorInput {
  boardConcurrency?: number;
  events: KanbanEventService;
  logger?: DiagnosticLogger;
  sqlite: Database;
}

function createAutomationPrompt(task: TaskPayload, column: KanbanColumnPayload) {
  return [
    `Run the ${column.name} column automation for task "${task.title}".`,
    `Objective: ${task.objective}`,
    task.scope ? `Scope: ${task.scope}` : null,
    task.acceptanceCriteria.length > 0
      ? `Acceptance Criteria:\n- ${task.acceptanceCriteria.join('\n- ')}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

function resolveAutomationAgentId(
  task: TaskPayload,
  column: KanbanColumnPayload,
) {
  return (
    column.automation?.specialistId ??
    task.assignedSpecialistId ??
    task.assignedRole ??
    'kanban-automation'
  );
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

export function createKanbanWorkflowOrchestrator(
  input: CreateKanbanWorkflowOrchestratorInput,
): KanbanWorkflowOrchestrator {
  const boardConcurrency = Math.max(1, input.boardConcurrency ?? 1);
  const activeAutomations = new Map<string, ActiveKanbanAutomation>();
  const queuedAutomations = new Map<string, QueuedKanbanAutomation[]>();
  const processedCompletionEvents = new Set<string>();
  let unsubscribe: (() => void) | null = null;

  function listQueuedAutomations() {
    return Array.from(queuedAutomations.values()).flatMap((items) => items);
  }

  function countActiveAutomationsForBoard(boardId: string) {
    return Array.from(activeAutomations.values()).filter(
      (automation) => automation.boardId === boardId,
    ).length;
  }

  function hasQueuedAutomation(taskId: string, columnId: string) {
    return listQueuedAutomations().some(
      (automation) =>
        automation.taskId === taskId && automation.columnId === columnId,
    );
  }

  async function dispatchQueuedAutomation(queued: QueuedKanbanAutomation) {
    const board = await getProjectKanbanBoardById(
      input.sqlite,
      queued.projectId,
      queued.boardId,
    );
    const targetColumn = board.columns.find(
      (column) => column.id === queued.columnId,
    );
    if (!targetColumn?.automation?.enabled) {
      return false;
    }

    const task = await getTaskById(input.sqlite, queued.taskId);
    if (task.boardId !== queued.boardId || task.columnId !== queued.columnId) {
      return false;
    }

    const prepared = await prepareTaskForColumnAutomation(
      input.sqlite,
      task,
      targetColumn,
      input.logger,
    );
    if (!prepared.queueAutomation) {
      return false;
    }

    const backgroundTask = await createBackgroundTask(input.sqlite, {
      agentId: resolveAutomationAgentId(prepared.task, targetColumn),
      projectId: queued.projectId,
      prompt: createAutomationPrompt(prepared.task, targetColumn),
      taskId: prepared.task.id,
      title: `${targetColumn.name}: ${prepared.task.title}`,
      triggerSource: 'workflow',
      triggeredBy: 'kanban-workflow-orchestrator',
    });

    activeAutomations.set(prepared.task.id, {
      autoAdvanceOnSuccess: targetColumn.automation.autoAdvanceOnSuccess,
      backgroundTaskId: backgroundTask.id,
      boardId: board.id,
      columnId: targetColumn.id,
      projectId: queued.projectId,
      taskId: prepared.task.id,
      taskTitle: prepared.task.title,
      triggerSessionId: prepared.task.triggerSessionId,
    });

    input.logger?.info?.(
      {
        backgroundTaskId: backgroundTask.id,
        boardId: board.id,
        columnId: targetColumn.id,
        taskId: prepared.task.id,
      },
      'Queued Kanban column automation',
    );

    return true;
  }

  async function drainBoardQueue(boardId: string) {
    const queue = queuedAutomations.get(boardId);
    if (!queue?.length) {
      return;
    }

    while (
      queue.length > 0 &&
      countActiveAutomationsForBoard(boardId) < boardConcurrency
    ) {
      const next = queue.shift();
      if (!next) {
        break;
      }

      await dispatchQueuedAutomation(next);
    }

    if (queue.length === 0) {
      queuedAutomations.delete(boardId);
    }
  }

  async function queueColumnTransition(event: TaskColumnTransitionEvent) {
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

    const task = await getTaskById(input.sqlite, event.taskId);
    const prepared = await prepareTaskForColumnAutomation(
      input.sqlite,
      task,
      targetColumn,
      input.logger,
    );

    if (!prepared.queueAutomation) {
      return;
    }

    const activeAutomation = activeAutomations.get(prepared.task.id);
    if (activeAutomation?.columnId === targetColumn.id) {
      return;
    }

    if (hasQueuedAutomation(prepared.task.id, targetColumn.id)) {
      return;
    }

    const queued: QueuedKanbanAutomation = {
      boardId: board.id,
      columnId: targetColumn.id,
      enqueuedAt: new Date().toISOString(),
      projectId: event.projectId,
      taskId: prepared.task.id,
      taskTitle: prepared.task.title,
    };

    const queue = queuedAutomations.get(board.id) ?? [];
    queue.push(queued);
    queuedAutomations.set(board.id, queue);
    await drainBoardQueue(board.id);
  }

  async function bindAutomationToSession(
    event: BackgroundTaskSessionStartedEvent,
  ) {
    const automation = activeAutomations.get(event.taskId);
    if (!automation || automation.backgroundTaskId !== event.backgroundTaskId) {
      return;
    }

    automation.triggerSessionId = event.sessionId;
  }

  async function autoAdvanceTask(
    automation: ActiveKanbanAutomation,
    backgroundTask: BackgroundTaskCompletionEvent,
  ) {
    const completionKey = `${backgroundTask.backgroundTaskId}:${backgroundTask.sessionId ?? 'none'}`;
    if (processedCompletionEvents.has(completionKey)) {
      return;
    }
    processedCompletionEvents.add(completionKey);

    if (!backgroundTask.success) {
      activeAutomations.delete(automation.taskId);
      await drainBoardQueue(automation.boardId);
      return;
    }

    if (!automation.autoAdvanceOnSuccess) {
      activeAutomations.delete(automation.taskId);
      await drainBoardQueue(automation.boardId);
      return;
    }

    const board = await getProjectKanbanBoardById(
      input.sqlite,
      automation.projectId,
      automation.boardId,
    );
    const task = await getTaskById(input.sqlite, automation.taskId);

    if (task.columnId !== automation.columnId) {
      activeAutomations.delete(automation.taskId);
      await drainBoardQueue(automation.boardId);
      return;
    }

    if (
      automation.triggerSessionId &&
      backgroundTask.sessionId &&
      automation.triggerSessionId !== backgroundTask.sessionId
    ) {
      return;
    }

    const orderedColumns = board.columns
      .slice()
      .sort((left, right) => left.position - right.position);
    const currentIndex = orderedColumns.findIndex(
      (column) => column.id === automation.columnId,
    );
    const nextColumn = orderedColumns[currentIndex + 1];

    activeAutomations.delete(automation.taskId);
    await drainBoardQueue(automation.boardId);

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
      return Array.from(activeAutomations.values());
    },

    getQueuedAutomations() {
      return listQueuedAutomations();
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

        if (event.type === 'background-task.session-started') {
          await bindAutomationToSession(event);
          return;
        }

        if (event.type === 'background-task.completed') {
          const automation = activeAutomations.get(event.taskId);
          if (!automation || automation.backgroundTaskId !== event.backgroundTaskId) {
            return;
          }

          await autoAdvanceTask(automation, event);
        }
      });
    },

    stop() {
      unsubscribe?.();
      unsubscribe = null;
      activeAutomations.clear();
      queuedAutomations.clear();
      processedCompletionEvents.clear();
    },
  };
}
