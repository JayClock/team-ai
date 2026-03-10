import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveDesktopCorsHeaders } from '../plugins/desktop-cors';
import {
  presentOrchestrationEvents,
  presentOrchestrationSession,
  presentOrchestrationSessionList,
  presentOrchestrationStep,
  presentOrchestrationSteps,
  presentStepEvents,
} from '../presenters/orchestration-presenter';
import {
  cancelOrchestrationSession,
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

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

const stepParamsSchema = z.object({
  stepId: z.string().min(1),
});

const sessionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sessions', async (request) => {
    const query = listSessionsQuerySchema.parse(request.query);
    const payload = await listOrchestrationSessions(fastify.sqlite, query);
    return presentOrchestrationSessionList(payload, query);
  });

  fastify.get('/sessions/:sessionId', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationSession(
      await getOrchestrationSessionById(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/sessions/:sessionId/steps', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationSteps(
      await listOrchestrationSteps(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/sessions/:sessionId/events', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return presentOrchestrationEvents(
      sessionId,
      await listOrchestrationEvents(fastify.sqlite, sessionId),
    );
  });

  fastify.get('/sessions/:sessionId/stream', async (request, reply) => {
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
  });

  fastify.post('/sessions/:sessionId/cancel', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await cancelOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.post('/sessions/:sessionId/resume', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await resumeOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.post('/sessions/:sessionId/retry', async (request) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const { session } = await retryOrchestrationSession(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
      sessionId,
      fastify.agentGatewayClient,
    );
    return presentOrchestrationSession(session);
  });

  fastify.get('/steps/:stepId', async (request) => {
    const { stepId } = stepParamsSchema.parse(request.params);
    return presentOrchestrationStep(
      await getOrchestrationStepById(fastify.sqlite, stepId),
    );
  });

  fastify.get('/steps/:stepId/events', async (request) => {
    const { stepId } = stepParamsSchema.parse(request.params);
    const { events, sessionId } = await listStepEvents(fastify.sqlite, stepId);
    return presentStepEvents(stepId, sessionId, events);
  });

  fastify.post('/steps/:stepId/retry', async (request) => {
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

export default sessionsRoute;
