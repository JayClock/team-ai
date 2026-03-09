import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentGatewayClient } from '../clients/agent-gateway-client';
import problemJsonPlugin from '../plugins/problem-json';
import healthRoute from './health';

describe('health route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('checks gateway readiness when configured', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const healthMock = vi.fn(async () => ({
      configured: true,
      reachable: true,
      status: 'ok',
    }));

    fastify.decorate('agentGatewayClient', {
      cancel: vi.fn(),
      createSession: vi.fn(),
      health: healthMock,
      isConfigured: vi.fn(() => true),
      listEvents: vi.fn(),
      prompt: vi.fn(),
      stream: vi.fn(),
    } satisfies AgentGatewayClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(healthRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health?check=ready',
    });

    expect(response.statusCode).toBe(200);
    expect(healthMock).toHaveBeenCalledTimes(1);
  });

  it('skips gateway readiness when client is not configured', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const healthMock = vi.fn();

    fastify.decorate('agentGatewayClient', {
      cancel: vi.fn(),
      createSession: vi.fn(),
      health: healthMock,
      isConfigured: vi.fn(() => false),
      listEvents: vi.fn(),
      prompt: vi.fn(),
      stream: vi.fn(),
    } satisfies AgentGatewayClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(healthRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health?check=ready',
    });

    expect(response.statusCode).toBe(200);
    expect(healthMock).not.toHaveBeenCalled();
  });
});
