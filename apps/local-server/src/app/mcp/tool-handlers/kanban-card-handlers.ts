import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  blockCardArgsSchema,
  createCardArgsSchema,
  getBoardViewArgsSchema,
  moveCardArgsSchema,
  unblockCardArgsSchema,
  updateCardArgsSchema,
} from '../contracts';
import {
  createKanbanCard,
  moveKanbanCard,
} from '../../services/kanban-card-service';
import {
  ensureDefaultKanbanBoard,
  getProjectKanbanBoardById,
  listProjectKanbanBoards,
} from '../../services/kanban-board-service';
import { getProjectById } from '../../services/project-service';
import { updateTask } from '../../services/task-service';
import { getTaskWorkflowRuntime } from '../task-workflow-runtime';
import { getProjectTask } from '../utils';

type CreateCardArgs = z.infer<typeof createCardArgsSchema>;
type UpdateCardArgs = z.infer<typeof updateCardArgsSchema>;
type MoveCardArgs = z.infer<typeof moveCardArgsSchema>;
type BlockCardArgs = z.infer<typeof blockCardArgsSchema>;
type UnblockCardArgs = z.infer<typeof unblockCardArgsSchema>;
type GetBoardViewArgs = z.infer<typeof getBoardViewArgsSchema>;

async function resolveBoard(
  fastify: FastifyInstance,
  projectId: string,
  boardId?: string,
) {
  if (boardId) {
    return getProjectKanbanBoardById(fastify.sqlite, projectId, boardId);
  }

  const boards = await listProjectKanbanBoards(fastify.sqlite, projectId);
  return boards.items[0] ?? ensureDefaultKanbanBoard(fastify.sqlite, projectId);
}

export function createCreateCardHandler(fastify: FastifyInstance) {
  return async (args: CreateCardArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    const board = await resolveBoard(fastify, args.projectId, args.boardId);
    const targetColumn =
      board.columns.find((column) => column.id === args.columnId) ??
      board.columns.find((column) => column.stage === 'todo') ??
      board.columns[0];

    return {
      card: await createKanbanCard(
        fastify.sqlite,
        {
          acceptanceCriteria: args.acceptanceCriteria,
          assignedProvider: args.assignedProvider,
          assignedRole: args.assignedRole,
          assignedSpecialistId: args.assignedSpecialistId,
          assignedSpecialistName: args.assignedSpecialistName,
          boardId: board.id,
          columnId: targetColumn?.id ?? null,
          kind: args.kind,
          objective: args.objective,
          position: args.position,
          priority: args.priority,
          projectId: args.projectId,
          scope: args.scope,
          sessionId: args.sessionId,
          title: args.title,
          verificationCommands: args.verificationCommands,
        },
        fastify.hasDecorator('kanbanEventService')
          ? fastify.kanbanEventService
          : undefined,
      ),
    };
  };
}

export function createUpdateCardHandler(fastify: FastifyInstance) {
  return async (args: UpdateCardArgs) => {
    const workflow = getTaskWorkflowRuntime(fastify);
    await getProjectTask(fastify.sqlite, args.projectId, args.cardId);
    const { cardId, projectId, ...patch } = args;
    void projectId;

    return {
      card: await workflow.patchTaskFromMcpAndMaybeExecute(cardId, patch, {
        logger: fastify.log,
        source: 'mcp_update_card_auto_execute',
      }),
    };
  };
}

export function createMoveCardHandler(fastify: FastifyInstance) {
  return async (args: MoveCardArgs) => {
    await getProjectTask(fastify.sqlite, args.projectId, args.cardId);

    return {
      card: await moveKanbanCard(
        fastify.sqlite,
        {
          boardId: args.boardId,
          columnId: args.columnId,
          position: args.position,
          taskId: args.cardId,
        },
        fastify.hasDecorator('kanbanEventService')
          ? fastify.kanbanEventService
          : undefined,
      ),
    };
  };
}

export function createBlockCardHandler(fastify: FastifyInstance) {
  return async (args: BlockCardArgs) => {
    const task = await getProjectTask(fastify.sqlite, args.projectId, args.cardId);
    const board = await resolveBoard(
      fastify,
      args.projectId,
      args.boardId ?? task.boardId ?? undefined,
    );
    const blockedColumn = board.columns.find((column) => column.stage === 'blocked');
    if (!blockedColumn) {
      throw new Error(`Board ${board.id} does not expose a Blocked column`);
    }

    const moved = await moveKanbanCard(
      fastify.sqlite,
      {
        boardId: board.id,
        columnId: blockedColumn.id,
        taskId: args.cardId,
      },
      fastify.hasDecorator('kanbanEventService')
        ? fastify.kanbanEventService
        : undefined,
    );
    const updated = await updateTask(fastify.sqlite, moved.id, {
      lastSyncError: args.reason,
      status: 'WAITING_RETRY',
    });

    return {
      card: updated,
      reason: args.reason,
    };
  };
}

export function createUnblockCardHandler(fastify: FastifyInstance) {
  return async (args: UnblockCardArgs) => {
    const task = await getProjectTask(fastify.sqlite, args.projectId, args.cardId);
    const board = await resolveBoard(
      fastify,
      args.projectId,
      args.boardId ?? task.boardId ?? undefined,
    );
    const fallbackColumnId =
      args.columnId ??
      [...task.laneSessions]
        .reverse()
        .find((entry) => entry.columnId && entry.columnId !== task.columnId)
        ?.columnId ??
      board.columns.find((column) => column.stage === 'todo')?.id;
    if (!fallbackColumnId) {
      throw new Error(`Board ${board.id} does not expose a valid unblock target`);
    }

    return {
      card: await updateTask(
        fastify.sqlite,
        (
          await moveKanbanCard(
            fastify.sqlite,
            {
              boardId: board.id,
              columnId: fallbackColumnId,
              position: args.position,
              taskId: args.cardId,
            },
            fastify.hasDecorator('kanbanEventService')
              ? fastify.kanbanEventService
              : undefined,
          )
        ).id,
        {
          lastSyncError: null,
        },
      ),
    };
  };
}

export function createGetBoardViewHandler(fastify: FastifyInstance) {
  return async (args: GetBoardViewArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    const board = await resolveBoard(fastify, args.projectId, args.boardId);

    return {
      board,
    };
  };
}
