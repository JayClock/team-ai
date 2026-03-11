import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentSession, presentSessionList } from '../presenters/session-presenter';
import { createSession, listSessions } from '../services/session-service';

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().min(1).optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const createSessionBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  parentSessionId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
});

const projectSessionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/sessions', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listSessionsQuerySchema.parse(request.query);
    const payload = await listSessions(fastify.sqlite, {
      page: query.page,
      pageSize: query.pageSize,
      projectId,
      status: query.status,
    });

    return presentSessionList(payload);
  });

  fastify.post('/projects/:projectId/sessions', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createSessionBodySchema.parse(request.body);
    const session = await createSession(fastify.sqlite, {
      ...body,
      projectId,
    });

    reply.code(201).header('Location', `/api/sessions/${session.id}`);

    return presentSession(session);
  });
};

export default projectSessionsRoute;
