import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import acpRuntimePlugin from './acp-runtime';
import agentGatewayClientPlugin from './agent-gateway-client';
import executionRuntimePlugin from './execution-runtime';

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
    await fastify.register(agentGatewayClientPlugin);
    await fastify.register(acpRuntimePlugin);
    await fastify.ready();

    expect(fastify.acpRuntime.isConfigured('opencode')).toBe(true);
    expect(fastify.acpRuntime.isConfigured('custom-provider')).toBe(true);
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
