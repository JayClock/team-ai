import type { Database } from 'better-sqlite3';
import { ProblemError } from '@orchestration/runtime-acp';
import type { KanbanEventService } from './kanban-event-service';
import { getProjectKanbanBoardById } from './kanban-board-service';
import {
  appendKanbanPolicyBypassAudit,
  assertKanbanTransitionPolicy,
  evaluateKanbanTransitionPolicy,
  getKanbanPolicyViolationMessage,
} from './kanban-policy-service';
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
    expectedUpdatedAt?: string | null;
    force?: boolean;
    policyBypassReason?: string | null;
    position?: number | null;
    taskId: string;
  },
  events?: KanbanEventService,
) {
  const previous = await getTaskById(sqlite, input.taskId);

  if (
    input.expectedUpdatedAt &&
    input.expectedUpdatedAt !== previous.updatedAt
  ) {
    throw new ProblemError({
      detail:
        'The card changed since it was loaded. Refresh the board and try the move again.',
      status: 409,
      title: 'Kanban Card Stale',
      type: 'https://team-ai.dev/problems/kanban-card-stale',
    });
  }

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

  if (input.boardId && input.columnId) {
    const board = await getProjectKanbanBoardById(
      sqlite,
      previous.projectId,
      input.boardId,
    );
    const targetColumn = board.columns.find((column) => column.id === input.columnId);

    if (!targetColumn) {
      throw new ProblemError({
        detail: `Column ${input.columnId} was not found in board ${input.boardId}`,
        status: 404,
        title: 'Kanban Column Not Found',
        type: 'https://team-ai.dev/problems/kanban-column-not-found',
      });
    }

    const policyViolations = evaluateKanbanTransitionPolicy({
      board,
      sourceColumnId: previous.columnId,
      targetColumn,
      task: previous,
    });

    try {
      assertKanbanTransitionPolicy({
        board,
        sourceColumnId: previous.columnId,
        targetColumn,
        task: previous,
      });
    } catch (error) {
      if (!input.force) {
        throw error;
      }

      const policyBypassReason = input.policyBypassReason?.trim();
      if (!policyBypassReason) {
        throw new ProblemError({
          detail: 'A bypass reason is required when forcing a policy-blocked move.',
          status: 400,
          title: 'Kanban Policy Bypass Reason Required',
          type: 'https://team-ai.dev/problems/kanban-policy-bypass-reason-required',
        });
      }

      nextPatch.laneHandoffs = appendKanbanPolicyBypassAudit(previous, {
        reason: policyBypassReason,
        sourceColumnId: previous.columnId,
        targetColumnId: input.columnId,
        violations:
          policyViolations.length > 0
            ? policyViolations
            : [
                {
                  code: 'manual_approval_required',
                  message: getKanbanPolicyViolationMessage(error),
                },
              ],
      });
    }
  }

  if (
    prepareTaskForColumnTransition(transitionState, {
      boardId: input.boardId,
      columnId: input.columnId,
    })
  ) {
    nextPatch.laneSessions = transitionState.laneSessions;
    nextPatch.lastSyncError = transitionState.lastSyncError;
    nextPatch.laneHandoffs = nextPatch.laneHandoffs ?? transitionState.laneHandoffs;
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
