import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { AcpEventEnvelopePayload } from '../schemas/acp';

type AcpListener = (event: AcpEventEnvelopePayload) => void;

export class AcpStreamBroker {
  private readonly listeners = new Map<string, Set<AcpListener>>();

  publish(event: AcpEventEnvelopePayload) {
    const listeners = this.listeners.get(event.sessionId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscribe(sessionId: string, listener: AcpListener) {
    const listeners = this.listeners.get(sessionId) ?? new Set<AcpListener>();
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
    acpStreamBroker: AcpStreamBroker;
  }
}

const acpStreamPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('acpStreamBroker', new AcpStreamBroker());
};

export default fp(acpStreamPlugin, {
  name: 'acp-stream',
});
