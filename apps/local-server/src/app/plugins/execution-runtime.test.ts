import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import executionRuntimePlugin from './execution-runtime';

describe('execution-runtime plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('decorates fastify with the provided agent gateway base url', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin, {
      agentGatewayBaseUrl: 'http://127.0.0.1:3321',
    });
    await fastify.ready();

    expect(fastify.agentGatewayBaseUrl).toBe('http://127.0.0.1:3321');
  });

  it('falls back to null when no base url is configured', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(executionRuntimePlugin);
    await fastify.ready();

    expect(fastify.agentGatewayBaseUrl).toBeNull();
  });
});
