import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import acpRuntimePlugin from './acp-runtime.js';
import agentGatewayClientPlugin from './agent-gateway-client.js';
import executionRuntimePlugin from './execution-runtime.js';

describe('acp-runtime plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('prefers the agent-gateway runtime when the sidecar is configured', async () => {
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
    await fastify.register(acpRuntimePlugin);
    await fastify.ready();

    expect(fastify.acpRuntime.isConfigured('opencode')).toBe(true);
    expect(fastify.acpRuntime.isConfigured('custom-provider')).toBe(false);
  });

  it('falls back to the local ACP runtime when agent-gateway is unavailable', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin, {
      agentGatewayBaseUrl: null as never,
    });
    await fastify.register(agentGatewayClientPlugin);
    await fastify.register(acpRuntimePlugin);
    await fastify.ready();

    expect(fastify.acpRuntime.isConfigured('codex')).toBe(true);
    expect(fastify.acpRuntime.isConfigured('custom-provider')).toBe(false);
  });
});
