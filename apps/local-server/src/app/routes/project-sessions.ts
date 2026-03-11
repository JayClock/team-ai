import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentOrchestrationSession,
  presentOrchestrationSessionList,
} from '../presenters/orchestration-presenter';
import {
  createOrchestrationSession,
  listOrchestrationSessions,
} from '../services/orchestration-service';

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum([
      'PENDING',
      'PLANNING',
      'RUNNING',
      'PAUSED',
      'FAILED',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const createSessionBodySchema = z.object({
  cwd: z.string().trim().min(1).optional(),
  executionMode: z.enum(['ROUTA', 'DEVELOPER']).optional(),
  provider: z.string().trim().min(1).optional(),
  traceId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
});

const projectSessionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/sessions', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listSessionsQuerySchema.parse(request.query);
    const payload = await listOrchestrationSessions(fastify.sqlite, {
      page: query.page,
      pageSize: query.pageSize,
      projectId,
      status: query.status,
    });

    return presentOrchestrationSessionList(payload, {
      page: query.page,
      pageSize: query.pageSize,
      projectId,
      status: query.status,
    });
  });

  fastify.post('/projects/:projectId/sessions', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createSessionBodySchema.parse(request.body);
    const { session } = await createOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      {
        ...body,
        projectId,
      },
      fastify.agentGatewayClient,
    );

    reply.code(201).header('Location', `/api/sessions/${session.id}`);

    return presentOrchestrationSession(session);
  });
};

export default projectSessionsRoute;
