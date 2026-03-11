import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentSession,
  presentSessionContext,
  presentSessionHistory,
  presentSessionList,
} from '../presenters/session-presenter';
import {
  deleteSession,
  getSessionById,
  getSessionContext,
  getSessionHistory,
  listSessions,
  updateSession,
} from '../services/session-service';

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().optional(),
  status: z.string().trim().min(1).optional(),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

const updateSessionBodySchema = z
  .object({
    metadata: z.record(z.string(), z.unknown()).optional(),
    parentSessionId: z.union([z.string().trim().min(1), z.null()]).optional(),
    status: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.status !== undefined ||
      value.metadata !== undefined ||
      value.parentSessionId !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

const sessionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sessions', async (request) => {
    const query = listSessionsQuerySchema.parse(request.query);
    const payload = await listSessions(fastify.sqlite, query);
    return presentSessionList(payload);
  });

  fastify.get('/sessions/:sessionId', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentSession(await getSessionById(fastify.sqlite, sessionId));
  });

  fastify.get('/sessions/:sessionId/history', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentSessionHistory(
      await getSessionHistory(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/sessions/:sessionId/context', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentSessionContext(
      await getSessionContext(fastify.sqlite, sessionId),
    );
  });

  fastify.patch('/sessions/:sessionId', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const body = updateSessionBodySchema.parse(request.body);
    return presentSession(await updateSession(fastify.sqlite, sessionId, body));
  });

  fastify.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    await deleteSession(fastify.sqlite, sessionId);
    reply.code(204);
    return null;
  });
};

export default sessionsRoute;
