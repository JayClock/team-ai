import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLocalMcpServer } from '../mcp';
import type { McpSession } from '../mcp/contracts';
import {
  isInitializeRequestBody,
  readSessionIdHeader,
  resolveAccessMode,
  setMcpCorsHeaders,
} from '../mcp/utils';

async function closeSession(session: McpSession) {
  try {
    await session.server.close();
  } catch {
    // ignore server close errors during cleanup
  }
}

const mcpRoute: FastifyPluginAsync = async (fastify) => {
  const sessions = new Map<string, McpSession>();

  const createSession = async (
    accessMode: McpSession['accessMode'],
  ): Promise<McpSession> => {
    const { server } = createLocalMcpServer(fastify, accessMode);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
    });

    await server.connect(transport);

    transport.onerror = (error) => {
      fastify.log.error({ err: error }, 'MCP transport error');
    };

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) {
        sessions.delete(sessionId);
      }
    };

    return {
      accessMode,
      server,
      transport,
    };
  };

  fastify.addHook('onClose', async () => {
    await Promise.all([...sessions.values()].map((session) => closeSession(session)));
    sessions.clear();
  });

  fastify.route({
    method: ['DELETE', 'GET', 'OPTIONS', 'POST'],
    url: '/mcp',
    handler: async (request, reply) => {
      setMcpCorsHeaders(reply);

      if (request.method === 'OPTIONS') {
        reply.code(204).send();
        return;
      }

      const sessionId = readSessionIdHeader(request);
      let session = sessionId ? sessions.get(sessionId) : undefined;

      if (!session) {
        if (sessionId) {
          reply.code(404).send({
            error: 'MCP session not found',
          });
          return;
        }

        if (request.method !== 'POST' || !isInitializeRequestBody(request.body)) {
          reply.code(400).send({
            error:
              'MCP session required. Send an initialize request before calling other methods.',
          });
          return;
        }

        session = await createSession(resolveAccessMode(request));
      }

      reply.hijack();
      await session.transport.handleRequest(request.raw, reply.raw, request.body);

      if (session.transport.sessionId) {
        sessions.set(session.transport.sessionId, session);
      }
    },
  });
};

export default mcpRoute;
