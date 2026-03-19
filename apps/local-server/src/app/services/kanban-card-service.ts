import type { Database } from 'better-sqlite3';
import type { KanbanEventService } from './kanban-event-service';
import { prepareTaskForColumnTransition } from './task-lane-service';
import {
  createTask,
  getTaskById,
  normalizeTaskPositionsInColumn,
  placeTaskInColumn,
  updateTask,
  type TaskStatus,
} from './task-service';
import { resolveTaskStatusForWorkflowColumn } from './task-workflow-service';
import type { CreateTaskInput, TaskPayload, UpdateTaskInput } from '../schemas/task';

function inputPosition(
  requestedPosition: number | null | undefined,
  currentPosition: number | null,
) {
  if (requestedPosition === undefined) {
    return currentPosition;
  }

  return requestedPosition;
}

async function emitColumnTransition(
  events: KanbanEventService | undefined,
  previous: TaskPayload,
  next: TaskPayload,
) {
  if (!events || !next.boardId || !next.columnId) {
    return;
  }

  if (
    previous.boardId === next.boardId &&
    previous.columnId === next.columnId
  ) {
    return;
  }

  await events.emit({
    boardId: next.boardId,
    fromColumnId: previous.columnId,
    projectId: next.projectId,
    taskId: next.id,
    taskTitle: next.title,
    toColumnId: next.columnId,
    type: 'task.column-transition',
  });
}

export async function createKanbanCard(
  sqlite: Database,
  input: CreateTaskInput,
  events?: KanbanEventService,
) {
  const task = await createTask(sqlite, input);

  if (task.boardId && task.columnId && input.position !== undefined) {
    placeTaskInColumn(sqlite, {
      boardId: task.boardId,
      columnId: task.columnId,
      position: input.position,
      projectId: task.projectId,
      taskId: task.id,
    });
  }

  const createdTask =
    task.boardId && task.columnId && input.position !== undefined
      ? await getTaskById(sqlite, task.id)
      : task;

  await emitColumnTransition(events, task, createdTask);
  return createdTask;
}

export async function moveKanbanCard(
  sqlite: Database,
  input: {
    boardId: string | null;
    columnId: string | null;
    position?: number | null;
    taskId: string;
  },
  events?: KanbanEventService,
) {
  const previous = await getTaskById(sqlite, input.taskId);
  const transitionState = {
    boardId: previous.boardId,
    columnId: previous.columnId,
    laneHandoffs: previous.laneHandoffs,
    laneSessions: previous.laneSessions,
    lastSyncError: previous.lastSyncError,
    sessionIds: previous.sessionIds,
    triggerSessionId: previous.triggerSessionId,
  };
  const nextPatch: UpdateTaskInput = {
    boardId: input.boardId,
    columnId: input.columnId,
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  if (
    prepareTaskForColumnTransition(transitionState, {
      boardId: input.boardId,
      columnId: input.columnId,
    })
  ) {
    nextPatch.laneSessions = transitionState.laneSessions;
    nextPatch.lastSyncError = transitionState.lastSyncError;
    nextPatch.sessionIds = transitionState.sessionIds;
    nextPatch.triggerSessionId = transitionState.triggerSessionId;
  }

  if (nextPatch.status === undefined) {
    nextPatch.status = resolveTaskStatusForWorkflowColumn(
      input.columnId,
      null,
      previous.status,
    ) as TaskStatus;
  }

  const updated = await updateTask(sqlite, input.taskId, nextPatch);
  const targetPosition = inputPosition(input.position, updated.position);

  if (
    previous.boardId !== updated.boardId ||
    previous.columnId !== updated.columnId ||
    input.position !== undefined
  ) {
    if (previous.boardId && previous.columnId) {
      normalizeTaskPositionsInColumn(
        sqlite,
        previous.projectId,
        previous.boardId,
        previous.columnId,
      );
    }

    placeTaskInColumn(sqlite, {
      boardId: updated.boardId,
      columnId: updated.columnId,
      position: targetPosition,
      projectId: updated.projectId,
      taskId: updated.id,
    });
  }

  const positionedTask =
    previous.boardId !== updated.boardId ||
    previous.columnId !== updated.columnId ||
    input.position !== undefined
      ? await getTaskById(sqlite, input.taskId)
      : updated;

  await emitColumnTransition(events, previous, positionedTask);
  return positionedTask;
}
