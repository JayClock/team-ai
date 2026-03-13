import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import agentGatewayClientPlugin from './agent-gateway-client';
import executionRuntimePlugin from './execution-runtime';

describe('agent-gateway-client plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('decorates fastify with a configured client', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin, {
      agentGatewayBaseUrl: 'http://127.0.0.1:3321',
    });
    await fastify.register(agentGatewayClientPlugin, {
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          providers: [
            {
              id: 'opencode',
              status: 'available',
            },
          ],
          registry: {
            error: null,
            fetchedAt: null,
            url: 'https://example.test/registry.json',
          },
        }),
      })) as unknown as typeof fetch,
    });
    await fastify.ready();

    expect(fastify.agentGatewayClient.isConfigured()).toBe(true);
    expect(fastify.agentGatewayClient.isProviderConfigured('opencode')).toBe(
      true,
    );
    expect(
      fastify.agentGatewayClient.isProviderConfigured('custom-provider'),
    ).toBe(false);
  });

  it('allows overriding the runtime base url explicitly', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin, {
      agentGatewayBaseUrl: null as never,
    });
    await fastify.register(agentGatewayClientPlugin, {
      agentGatewayBaseUrl: 'http://127.0.0.1:9999',
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          providers: [
            {
              id: 'codex',
              status: 'available',
            },
          ],
          registry: {
            error: null,
            fetchedAt: null,
            url: 'https://example.test/registry.json',
          },
        }),
      })) as unknown as typeof fetch,
    });
    await fastify.ready();

    expect(fastify.agentGatewayClient.isConfigured()).toBe(true);
    expect(fastify.agentGatewayClient.isProviderConfigured('codex')).toBe(true);
  });
});
