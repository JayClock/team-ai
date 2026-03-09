import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveDesktopCorsHeaders } from '../plugins/desktop-cors';
import {
  presentOrchestrationEvents,
  presentOrchestrationRoot,
  presentOrchestrationSession,
  presentOrchestrationSessionList,
  presentOrchestrationStep,
  presentOrchestrationSteps,
  presentStepEvents,
} from '../presenters/orchestration-presenter';
import {
  cancelOrchestrationSession,
  createOrchestrationSession,
  getOrchestrationSessionById,
  getOrchestrationStepById,
  listOrchestrationEvents,
  listOrchestrationSessions,
  listOrchestrationSteps,
  listStepEvents,
  resumeOrchestrationSession,
  retryOrchestrationSession,
  retryOrchestrationStep,
} from '../services/orchestration-service';

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().optional(),
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

const createSessionBodySchema = z.object({
  executionMode: z.enum(['ROUTA', 'DEVELOPER']).optional(),
  projectId: z.string().min(1),
  provider: z.string().trim().min(1).optional(),
  traceId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  workspaceRoot: z.string().trim().min(1).optional(),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

const stepParamsSchema = z.object({
  stepId: z.string().min(1),
});

const orchestrationRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/orchestration', async () => presentOrchestrationRoot());

  fastify.get('/orchestration/sessions', async (request) => {
    const query = listSessionsQuerySchema.parse(request.query);
    return presentOrchestrationSessionList(
      await listOrchestrationSessions(fastify.sqlite, query),
    );
  });

  fastify.post('/orchestration/sessions', async (request, reply) => {
    const body = createSessionBodySchema.parse(request.body);
    const { session } = await createOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      body,
      fastify.agentGatewayClient,
    );

    reply
      .code(201)
      .header('Location', `/api/orchestration/sessions/${session.id}`);

    return presentOrchestrationSession(session);
  });

  fastify.get('/orchestration/sessions/:sessionId', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationSession(
      await getOrchestrationSessionById(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/orchestration/sessions/:sessionId/steps', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationSteps(
      await listOrchestrationSteps(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/orchestration/sessions/:sessionId/events', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationEvents(
      sessionId,
      await listOrchestrationEvents(fastify.sqlite, sessionId),
    );
  });

  fastify.get(
    '/orchestration/sessions/:sessionId/stream',
    async (request, reply) => {
      const { sessionId } = sessionParamsSchema.parse(request.params);
      await getOrchestrationSessionById(fastify.sqlite, sessionId);

      reply.raw.writeHead(200, {
        ...resolveDesktopCorsHeaders(request.headers.origin),
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({
          sessionId,
          at: new Date().toISOString(),
        })}\n\n`,
      );

      const unsubscribe = fastify.orchestrationStreamBroker.subscribe(
        sessionId,
        (event) => {
          reply.raw.write(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        },
      );

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

  fastify.post('/orchestration/sessions/:sessionId/cancel', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await cancelOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.post('/orchestration/sessions/:sessionId/resume', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await resumeOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.post('/orchestration/sessions/:sessionId/retry', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await retryOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.get('/orchestration/steps/:stepId', async (request) => {
    const { stepId } = stepParamsSchema.parse(request.params);
    return presentOrchestrationStep(
      await getOrchestrationStepById(fastify.sqlite, stepId),
    );
  });

  fastify.get('/orchestration/steps/:stepId/events', async (request) => {
    const { stepId } = stepParamsSchema.parse(request.params);
    const { events, sessionId } = await listStepEvents(fastify.sqlite, stepId);
    return presentStepEvents(stepId, sessionId, events);
  });

  fastify.post('/orchestration/steps/:stepId/retry', async (request) => {
    const { stepId } = stepParamsSchema.parse(request.params);
    const { step } = await retryOrchestrationStep(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      stepId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationStep(step);
  });
};

export default orchestrationRoute;
