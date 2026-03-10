import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentGatewayClient } from '../clients/agent-gateway-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { createProject } from '../services/project-service';
import acpRoute from './acp';
import meRoute from './me';
import projectsRoute from './projects';
import rootRoute from './root';

describe('acp route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const originalDataDir = process.env.TEAMAI_DATA_DIR;

  afterEach(async () => {
    process.env.TEAMAI_DATA_DIR = originalDataDir;

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('creates desktop acp sessions and exposes history/resources from local-server', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-test-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const promptMock = vi.fn(async () => ({
      accepted: true,
      runtime: { provider: 'codex' },
      session: {
        sessionId: 'runtime-1',
        state: 'RUNNING',
      },
    }));
    const listEventsMock = vi
      .fn()
      .mockResolvedValueOnce({
        cursor: null,
        nextCursor: 'cursor-3',
        events: [
          {
            cursor: 'cursor-1',
            data: {
              state: 'RUNNING',
            },
            eventId: 'evt-1',
            type: 'status',
          },
          {
            cursor: 'cursor-2',
            data: {
              content: 'chunk',
            },
            eventId: 'evt-2',
            type: 'delta',
          },
          {
            cursor: 'cursor-3',
            data: {
              name: 'write_file',
            },
            eventId: 'evt-3',
            type: 'tool',
          },
          {
            cursor: 'cursor-4',
            data: {
              reason: 'prompt-finished',
            },
            eventId: 'evt-4',
            type: 'complete',
          },
        ],
        session: {
          sessionId: 'runtime-1',
          state: 'COMPLETED',
        },
      })
      .mockResolvedValue({
        cursor: null,
        nextCursor: 'cursor-4',
        events: [],
        session: {
          sessionId: 'runtime-1',
          state: 'COMPLETED',
        },
      });

    fastify.decorate('agentGatewayClient', {
      cancel: vi.fn(async () => ({
        accepted: true,
        session: { sessionId: 'runtime-1', state: 'CANCELLED' },
      })),
      createSession: vi.fn(async () => ({
        session: {
          sessionId: 'runtime-1',
          state: 'PENDING',
          provider: 'codex',
          createdAt: '2026-03-10T00:00:00.000Z',
        },
      })),
      health: vi.fn(),
      isConfigured: vi.fn(() => true),
      listEvents: listEventsMock,
      prompt: promptMock,
      stream: vi.fn(),
    } satisfies AgentGatewayClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          mode: 'CHAT',
          projectId: project.id,
          provider: 'codex',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json();
    const sessionId = createBody.result.session.id as string;

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-2',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId,
          prompt: 'hello desktop acp',
        },
      },
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 350));

    const sessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/sessions`,
    });

    expect(sessionsResponse.statusCode).toBe(200);
    expect(sessionsResponse.json()._embedded.sessions).toHaveLength(1);

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/sessions/${sessionId}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(
      historyResponse.json().history.map((event: { type: string }) => event.type),
    ).toContain('tool');

    const rootResponse = await fastify.inject({
      method: 'GET',
      url: '/api',
    });
    expect(rootResponse.json()._links.me.href).toBe('/api/me');
    expect(rootResponse.json()._links.acp.href).toBe('/api/acp');
  });
});
