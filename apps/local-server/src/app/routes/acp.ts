import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveDesktopCorsHeaders } from '../plugins/desktop-cors';
import {
  presentAcpProviders,
  presentInstalledAcpProvider,
} from '../presenters/acp-provider-presenter';
import {
  presentAcpHistory,
  presentAcpSession,
  presentAcpSessionList,
} from '../presenters/acp-presenter';
import {
  installAcpProvider,
  listAcpProviders,
} from '../services/acp-provider-service';
import {
  cancelAcpSession,
  createAcpSession,
  deleteAcpSession,
  getAcpSessionById,
  listAcpSessionHistory,
  listAcpSessionsByProject,
  loadAcpSession,
  promptAcpSession,
  renameAcpSession,
} from '../services/acp-service';

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const sessionParamsSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
  since: z.string().trim().min(1).optional(),
  sinceEventId: z.string().trim().min(1).optional(),
});

const renameSessionBodySchema = z.object({
  name: z.string().trim().min(1),
});

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  method: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

const acpStreamQuerySchema = z.object({
  sessionId: z.string().trim().min(1),
  since: z.string().trim().min(1).optional(),
  sinceEventId: z.string().trim().min(1).optional(),
});

const listAcpProvidersQuerySchema = z.object({
  registry: z.coerce.boolean().optional(),
});

const installAcpProviderBodySchema = z.object({
  providerId: z.string().trim().min(1),
  distributionType: z.enum(['npx', 'uvx', 'binary']).optional(),
});

function resultEnvelope(id: string | number | null | undefined, result: object) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    result,
    error: null,
  };
}

function errorEnvelope(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    result: null,
    error: {
      code,
      message,
    },
  };
}

const acpRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/acp/providers', async (request) => {
    const query = listAcpProvidersQuerySchema.parse(request.query);
    return presentAcpProviders(
      await listAcpProviders({
        includeRegistry: query.registry ?? true,
      }),
    );
  });

  fastify.post('/acp/install', async (request) => {
    const body = installAcpProviderBodySchema.parse(request.body);
    return presentInstalledAcpProvider(await installAcpProvider(body));
  });

  fastify.get('/projects/:projectId/acp-sessions', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listSessionsQuerySchema.parse(request.query);

    return presentAcpSessionList(
      await listAcpSessionsByProject(fastify.sqlite, projectId, query),
    );
  });

  fastify.get('/projects/:projectId/acp-sessions/:sessionId', async (request) => {
    const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
    const session = await getAcpSessionById(fastify.sqlite, sessionId);

    if (session.project.id !== projectId) {
      throw fastify.httpErrors.notFound();
    }

    return presentAcpSession(session);
  });

  fastify.get('/projects/:projectId/acp-sessions/:sessionId/history', async (request) => {
    const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
    const query = historyQuerySchema.parse(request.query);
    return presentAcpHistory(
      projectId,
      sessionId,
      await listAcpSessionHistory(
        fastify.sqlite,
        projectId,
        sessionId,
        query.limit,
        query.since ?? query.sinceEventId,
      ),
    );
  });

  fastify.patch('/projects/:projectId/acp-sessions/:sessionId', async (request) => {
    const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
    const body = renameSessionBodySchema.parse(request.body);
    const session = await renameAcpSession(fastify.sqlite, sessionId, body.name);

    if (session.project.id !== projectId) {
      throw fastify.httpErrors.notFound();
    }

    return presentAcpSession(session);
  });

  fastify.delete('/projects/:projectId/acp-sessions/:sessionId', async (request, reply) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    await deleteAcpSession(fastify.sqlite, fastify.acpRuntime, sessionId);
    reply.code(204).send();
  });

  fastify.post('/acp', async (request) => {
    const rpcRequest = jsonRpcRequestSchema.parse(request.body);
    const { id, method, params } = rpcRequest;

    try {
      switch (method) {
        case 'initialize':
          return resultEnvelope(id, {
            server: {
              name: 'team-ai-local-acp',
              version: 'desktop',
            },
            capabilities: {
              session: true,
              sse: true,
            },
            methods: [
              'initialize',
              'session/new',
              'session/load',
              'session/prompt',
              'session/cancel',
            ],
          });
        case 'session/new': {
          const result = await createAcpSession(
            fastify.sqlite,
            fastify.acpStreamBroker,
            fastify.acpRuntime,
            {
              projectId: z.string().min(1).parse(params.projectId),
              actorUserId: z.string().min(1).parse(params.actorUserId),
              provider: z.string().trim().min(1).optional().parse(params.provider) ?? 'codex',
              mode: z.string().trim().min(1).optional().parse(params.mode) ?? 'CHAT',
              parentSessionId: z.string().trim().min(1).optional().parse(params.parentSessionId),
              goal: z.string().trim().min(1).optional().parse(params.goal),
            },
          );
          return resultEnvelope(id, {
            session: {
              id: result.id,
              state: result.state,
            },
          });
        }
        case 'session/load': {
          const result = await loadAcpSession(
            fastify.sqlite,
            fastify.acpStreamBroker,
            fastify.acpRuntime,
            z.string().min(1).parse(params.projectId),
            z.string().min(1).parse(params.sessionId),
          );
          return resultEnvelope(id, {
            session: {
              id: result.id,
              state: result.state,
            },
          });
        }
        case 'session/prompt': {
          const result = await promptAcpSession(
            fastify.sqlite,
            fastify.acpStreamBroker,
            fastify.acpRuntime,
            z.string().min(1).parse(params.projectId),
            z.string().min(1).parse(params.sessionId),
            {
              prompt: z.string().trim().min(1).parse(params.prompt),
              timeoutMs: z.coerce.number().int().positive().optional().parse(params.timeoutMs),
              eventId: z.string().trim().min(1).optional().parse(params.eventId),
              traceId: z.string().trim().min(1).optional().parse(params.traceId),
            },
          );
          return resultEnvelope(id, {
            session: {
              id: result.session.id,
              state: result.session.state,
            },
            runtime: result.runtime ?? null,
          });
        }
        case 'session/cancel': {
          const result = await cancelAcpSession(
            fastify.sqlite,
            fastify.acpStreamBroker,
            fastify.acpRuntime,
            z.string().min(1).parse(params.projectId),
            z.string().min(1).parse(params.sessionId),
            z.string().trim().min(1).optional().parse(params.reason),
          );
          return resultEnvelope(id, {
            session: {
              id: result.id,
              state: result.state,
            },
          });
        }
        default:
          return errorEnvelope(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return errorEnvelope(
        id,
        -32000,
        error instanceof Error ? error.message : 'ACP request failed',
      );
    }
  });

  fastify.get('/acp', async (request, reply) => {
    const query = acpStreamQuerySchema.parse(request.query);
    const session = await getAcpSessionById(fastify.sqlite, query.sessionId);
    const history = await listAcpSessionHistory(
      fastify.sqlite,
      session.project.id,
      query.sessionId,
      500,
      query.since ?? query.sinceEventId,
    );

    reply.raw.writeHead(200, {
      ...resolveDesktopCorsHeaders(request.headers.origin),
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });

    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({
        sessionId: query.sessionId,
        at: new Date().toISOString(),
      })}\n\n`,
    );

    for (const event of history) {
      reply.raw.write(`event: acp-event\ndata: ${JSON.stringify(event)}\n\n`);
    }

    const unsubscribe = fastify.acpStreamBroker.subscribe(query.sessionId, (event) => {
      reply.raw.write(`event: acp-event\ndata: ${JSON.stringify(event)}\n\n`);
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
  });
};

export default acpRoute;
