import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { OrchestrationEventPayload } from '../schemas/orchestration';

type OrchestrationListener = (event: OrchestrationEventPayload) => void;

class OrchestrationStreamBroker {
  private readonly listeners = new Map<string, Set<OrchestrationListener>>();

  publish(event: OrchestrationEventPayload) {
    const listeners = this.listeners.get(event.sessionId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscribe(sessionId: string, listener: OrchestrationListener) {
    const listeners =
      this.listeners.get(sessionId) ?? new Set<OrchestrationListener>();

    listeners.add(listener);
    this.listeners.set(sessionId, listeners);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    orchestrationStreamBroker: OrchestrationStreamBroker;
  }
}

const orchestrationStreamPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('orchestrationStreamBroker', new OrchestrationStreamBroker());
};

export default fp(orchestrationStreamPlugin, {
  name: 'orchestration-stream',
});
