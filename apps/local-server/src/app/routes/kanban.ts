import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentKanbanBoard,
  presentKanbanBoardList,
} from '../presenters/kanban-presenter';
import {
  getProjectKanbanBoardById,
  listProjectKanbanBoards,
} from '../services/kanban-board-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const boardParamsSchema = z.object({
  boardId: z.string().min(1),
  projectId: z.string().min(1),
});

const kanbanRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/kanban/boards', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoards);

    return presentKanbanBoardList(
      await listProjectKanbanBoards(fastify.sqlite, projectId),
    );
  });

  fastify.get(
    '/projects/:projectId/kanban/boards/:boardId',
    async (request, reply) => {
      const { boardId, projectId } = boardParamsSchema.parse(request.params);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);

      return presentKanbanBoard(
        await getProjectKanbanBoardById(fastify.sqlite, projectId, boardId),
      );
    },
  );
};

export default kanbanRoute;
