import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentGatewayClient } from '../clients/agent-gateway-client';
import type { OrchestrationStreamBroker } from './orchestration-stream';

const recoverActiveOrchestrationSessionsMock = vi.fn();

vi.mock('../services/orchestration-service', () => ({
  recoverActiveOrchestrationSessions: recoverActiveOrchestrationSessionsMock,
}));

function deferredPromise() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('orchestration-runtime plugin', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    vi.clearAllMocks();

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('does not block readiness while recovering active sessions', async () => {
    const recovery = deferredPromise();
    recoverActiveOrchestrationSessionsMock.mockReturnValue(recovery.promise);

    const { default: orchestrationRuntimePlugin } = await import(
      './orchestration-runtime'
    );

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(
      fp(async (instance) => {
        instance.decorate('sqlite', {});
      }, { name: 'sqlite' }),
    );
    await fastify.register(
      fp(async (instance) => {
        instance.decorate('orchestrationStreamBroker', {});
      }, { name: 'orchestration-stream' }),
    );
    await fastify.register(
      fp(async (instance) => {
        instance.decorate('agentGatewayClient', {
          isConfigured: () => true,
        } satisfies Pick<AgentGatewayClient, 'isConfigured'>);
      }, { name: 'agent-gateway-client' }),
    );

    await fastify.register(orchestrationRuntimePlugin);
    await fastify.ready();

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(recoverActiveOrchestrationSessionsMock).toHaveBeenCalledWith(
      fastify.sqlite,
      fastify.orchestrationStreamBroker as OrchestrationStreamBroker,
      fastify.agentGatewayClient,
    );

    recovery.resolve();
    await recovery.promise;
  });
});
