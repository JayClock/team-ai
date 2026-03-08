import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

export interface MessageStreamEvent {
  at: string;
  content?: string;
  conversationId: string;
  errorMessage?: string | null;
  messageId: string;
  role: 'assistant' | 'user';
  status?: 'completed' | 'failed' | 'pending' | 'streaming';
  type:
    | 'message.created'
    | 'message.chunk'
    | 'message.completed'
    | 'message.failed'
    | 'message.retried';
}

type MessageListener = (event: MessageStreamEvent) => void;

class MessageStreamBroker {
  private readonly listeners = new Map<string, Set<MessageListener>>();

  publish(event: MessageStreamEvent) {
    const listeners = this.listeners.get(event.conversationId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscribe(conversationId: string, listener: MessageListener) {
    const listeners = this.listeners.get(conversationId) ?? new Set<MessageListener>();
    listeners.add(listener);
    this.listeners.set(conversationId, listeners);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(conversationId);
      }
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    messageStreamBroker: MessageStreamBroker;
  }
}

const messageStreamPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('messageStreamBroker', new MessageStreamBroker());
};

export default fp(messageStreamPlugin, {
  name: 'message-stream',
});
