import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import type { KanbanColumnPayload } from '../schemas/kanban';
import type { TaskPayload } from '../schemas/task';
import { createBackgroundTask } from './background-task-service';
import type {
  BackgroundTaskCompletionEvent,
  KanbanEventService,
  TaskColumnTransitionEvent,
} from './kanban-event-service';
import { getProjectKanbanBoardById } from './kanban-board-service';
import { getTaskById, updateTask } from './task-service';

export interface ActiveKanbanAutomation {
  autoAdvanceOnSuccess: boolean;
  backgroundTaskId: string;
  boardId: string;
  columnId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
}

export interface KanbanWorkflowOrchestrator {
  getActiveAutomations(): ActiveKanbanAutomation[];
  start(): void;
  stop(): void;
}

interface CreateKanbanWorkflowOrchestratorInput {
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

export function createKanbanWorkflowOrchestrator(
  input: CreateKanbanWorkflowOrchestratorInput,
): KanbanWorkflowOrchestrator {
  const activeAutomations = new Map<string, ActiveKanbanAutomation>();
  let unsubscribe: (() => void) | null = null;

  async function handleColumnTransition(event: TaskColumnTransitionEvent) {
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
    const backgroundTask = await createBackgroundTask(input.sqlite, {
      agentId: resolveAutomationAgentId(task, targetColumn),
      projectId: event.projectId,
      prompt: createAutomationPrompt(task, targetColumn),
      taskId: task.id,
      title: `${targetColumn.name}: ${task.title}`,
      triggerSource: 'workflow',
      triggeredBy: 'kanban-workflow-orchestrator',
    });

    activeAutomations.set(task.id, {
      autoAdvanceOnSuccess: targetColumn.automation.autoAdvanceOnSuccess,
      backgroundTaskId: backgroundTask.id,
      boardId: board.id,
      columnId: targetColumn.id,
      projectId: event.projectId,
      taskId: task.id,
      taskTitle: task.title,
    });

    input.logger?.info?.(
      {
        backgroundTaskId: backgroundTask.id,
        boardId: board.id,
        columnId: targetColumn.id,
        taskId: task.id,
      },
      'Queued Kanban column automation',
    );
  }

  async function autoAdvanceTask(
    automation: ActiveKanbanAutomation,
    backgroundTask: BackgroundTaskCompletionEvent,
  ) {
    if (!backgroundTask.success) {
      activeAutomations.delete(automation.taskId);
      return;
    }

    if (!automation.autoAdvanceOnSuccess) {
      activeAutomations.delete(automation.taskId);
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

    start() {
      if (unsubscribe) {
        return;
      }

      unsubscribe = input.events.subscribe(async (event) => {
        if (event.type === 'task.column-transition') {
          await handleColumnTransition(event);
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
    },
  };
}
