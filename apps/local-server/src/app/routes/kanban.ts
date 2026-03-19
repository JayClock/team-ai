import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveDesktopCorsHeaders } from '../plugins/desktop-cors';
import {
  presentKanbanBoard,
  presentKanbanBoardList,
} from '../presenters/kanban-presenter';
import type { KanbanEvent } from '../services/kanban-event-service';
import { intakeKanbanGoal } from '../services/kanban-intake-service';
import {
  createKanbanBoard,
  createKanbanColumn,
  deleteKanbanColumn,
  getProjectKanbanBoardById,
  listProjectKanbanBoards,
  updateKanbanBoard,
  updateKanbanColumn,
} from '../services/kanban-board-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const boardParamsSchema = z.object({
  boardId: z.string().min(1),
  projectId: z.string().min(1),
});

const columnParamsSchema = z.object({
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  projectId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const nullableNumberSchema = z.union([z.number().int().positive(), z.null()]);
const stageSchema = z.union([
  z.enum(['backlog', 'todo', 'dev', 'review', 'blocked', 'done']),
  z.null(),
]);
const automationSchema = z
  .object({
    autoAdvanceOnSuccess: z.boolean().optional(),
    enabled: z.boolean().optional(),
    provider: nullableStringSchema.optional(),
    requiredArtifacts: z.array(z.string().trim().min(1)).optional(),
    role: nullableStringSchema.optional(),
    specialistId: nullableStringSchema.optional(),
    specialistName: nullableStringSchema.optional(),
    transitionType: z.enum(['both', 'entry', 'exit']).optional(),
  })
  .optional();

const boardCreateBodySchema = z.object({
  isDefault: z.boolean().optional(),
  name: z.string().trim().min(1),
  settings: z
    .object({
      boardConcurrency: nullableNumberSchema.optional(),
      wipLimit: nullableNumberSchema.optional(),
    })
    .optional(),
});

const boardPatchBodySchema = z
  .object({
    isDefault: z.boolean().optional(),
    name: z.string().trim().min(1).optional(),
    settings: z
      .object({
        boardConcurrency: nullableNumberSchema.optional(),
        wipLimit: nullableNumberSchema.optional(),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one board field must be provided',
  });

const columnCreateBodySchema = z.object({
  automation: z.union([automationSchema, z.null()]).optional(),
  name: z.string().trim().min(1),
  position: z.number().int().nonnegative().optional(),
  stage: stageSchema.optional(),
});

const columnPatchBodySchema = z
  .object({
    automation: z.union([automationSchema, z.null()]).optional(),
    name: z.string().trim().min(1).optional(),
    position: z.number().int().nonnegative().optional(),
    stage: stageSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one column field must be provided',
  });

const intakeBodySchema = z.object({
  acceptanceHints: z.array(z.string().trim().min(1)).optional(),
  artifactHints: z.array(z.string().trim().min(1)).optional(),
  constraints: z.array(z.string().trim().min(1)).optional(),
  goal: z.string().trim().min(1),
  sessionId: nullableStringSchema.optional(),
});

const streamKanbanEventsQuerySchema = z.object({
  boardId: z.string().trim().min(1).optional(),
});

const kanbanRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/projects/:projectId/kanban/intake', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = intakeBodySchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanIntake);

    return await intakeKanbanGoal(fastify.sqlite, {
      acceptanceHints: body.acceptanceHints,
      artifactHints: body.artifactHints,
      constraints: body.constraints,
      goal: body.goal,
      projectId,
      sessionId: body.sessionId,
    });
  });

  fastify.get(
    '/projects/:projectId/kanban/events/stream',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = streamKanbanEventsQuerySchema.parse(request.query);

      reply.raw.writeHead(200, {
        ...resolveDesktopCorsHeaders(request.headers.origin),
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({
          at: new Date().toISOString(),
          boardId: query.boardId ?? null,
          projectId,
        })}\n\n`,
      );

      const unsubscribe = fastify.kanbanEventService.subscribe((event) => {
        if (!matchesKanbanEventFilter(event, projectId, query.boardId)) {
          return;
        }

        reply.raw.write(`event: kanban-event\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        reply.raw.write(
          `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
      }, 15_000);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      });

      return reply.hijack();
    },
  );

  fastify.get('/projects/:projectId/kanban/boards', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoards);

    return presentKanbanBoardList(
      await listProjectKanbanBoards(fastify.sqlite, projectId),
    );
  });

  fastify.post('/projects/:projectId/kanban/boards', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = boardCreateBodySchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);
    reply.code(201);

    return presentKanbanBoard(
      await createKanbanBoard(fastify.sqlite, {
        isDefault: body.isDefault,
        name: body.name,
        projectId,
        settings: body.settings,
      }),
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

  fastify.patch(
    '/projects/:projectId/kanban/boards/:boardId',
    async (request, reply) => {
      const { boardId, projectId } = boardParamsSchema.parse(request.params);
      const body = boardPatchBodySchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);

      return presentKanbanBoard(
        await updateKanbanBoard(fastify.sqlite, {
          boardId,
          isDefault: body.isDefault,
          name: body.name,
          projectId,
          settings: body.settings,
        }),
      );
    },
  );

  fastify.post(
    '/projects/:projectId/kanban/boards/:boardId/columns',
    async (request, reply) => {
      const { boardId, projectId } = boardParamsSchema.parse(request.params);
      const body = columnCreateBodySchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);
      reply.code(201);

      return presentKanbanBoard(
        await createKanbanColumn(fastify.sqlite, {
          automation: body.automation,
          boardId,
          name: body.name,
          position: body.position,
          projectId,
          stage: body.stage,
        }),
      );
    },
  );

  fastify.patch(
    '/projects/:projectId/kanban/boards/:boardId/columns/:columnId',
    async (request, reply) => {
      const { boardId, columnId, projectId } = columnParamsSchema.parse(
        request.params,
      );
      const body = columnPatchBodySchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);

      return presentKanbanBoard(
        await updateKanbanColumn(fastify.sqlite, {
          automation: body.automation,
          boardId,
          columnId,
          name: body.name,
          position: body.position,
          projectId,
          stage: body.stage,
        }),
      );
    },
  );

  fastify.delete(
    '/projects/:projectId/kanban/boards/:boardId/columns/:columnId',
    async (request, reply) => {
      const { boardId, columnId, projectId } = columnParamsSchema.parse(
        request.params,
      );

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.kanbanBoard);

      return presentKanbanBoard(
        await deleteKanbanColumn(fastify.sqlite, {
          boardId,
          columnId,
          projectId,
        }),
      );
    },
  );
};

export default kanbanRoute;

function matchesKanbanEventFilter(
  event: KanbanEvent,
  projectId: string,
  boardId?: string,
) {
  if (event.projectId !== projectId) {
    return false;
  }

  if (!boardId) {
    return true;
  }

  return !('boardId' in event) || event.boardId === boardId;
}
