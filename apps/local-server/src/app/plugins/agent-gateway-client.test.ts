import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
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
    await fastify.register(agentGatewayClientPlugin);
    await fastify.ready();

    expect(fastify.agentGatewayClient.isConfigured()).toBe(true);
  });

  it('allows overriding the runtime base url explicitly', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin, {
      agentGatewayBaseUrl: null as never,
    });
    await fastify.register(agentGatewayClientPlugin, {
      agentGatewayBaseUrl: 'http://127.0.0.1:9999',
    });
    await fastify.ready();

    expect(fastify.agentGatewayClient.isConfigured()).toBe(true);
  });
});
