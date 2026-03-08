import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentMessage, presentMessageList } from '../presenters/message-presenter';
import {
  createMessagePair,
  getMessageById,
  listMessagesByConversation,
  retryMessage,
  streamAssistantReply,
} from '../services/message-service';

const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const createMessageBodySchema = z.object({
  content: z.string().trim().min(1),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

const messageParamsSchema = z.object({
  messageId: z.string().min(1),
});

const messagesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/conversations/:conversationId/messages', async (request) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const query = listMessagesQuerySchema.parse(request.query);

    return presentMessageList(
      await listMessagesByConversation(fastify.sqlite, conversationId, query),
    );
  });

  fastify.post('/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const body = createMessageBodySchema.parse(request.body);
    const { assistantMessage, userMessage } = await createMessagePair(
      fastify.sqlite,
      conversationId,
      body.content,
    );

    fastify.messageStreamBroker.publish({
      type: 'message.created',
      at: userMessage.createdAt,
      conversationId,
      messageId: userMessage.id,
      role: 'user',
      content: userMessage.content,
      status: userMessage.status,
    });
    fastify.messageStreamBroker.publish({
      type: 'message.created',
      at: assistantMessage.createdAt,
      conversationId,
      messageId: assistantMessage.id,
      role: 'assistant',
      content: assistantMessage.content,
      status: assistantMessage.status,
    });

    void streamAssistantReply(
      fastify.sqlite,
      fastify.messageStreamBroker,
      assistantMessage.id,
    );

    reply
      .code(201)
      .header('Location', `/api/messages/${userMessage.id}`);

    return {
      userMessage: presentMessage(userMessage),
      assistantMessage: presentMessage(assistantMessage),
    };
  });

  fastify.get('/conversations/:conversationId/stream', async (request, reply) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);

    reply.raw.writeHead(200, {
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });

    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({
        conversationId,
        at: new Date().toISOString(),
      })}\n\n`,
    );

    const unsubscribe = fastify.messageStreamBroker.subscribe(
      conversationId,
      (event) => {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      },
    );

    const heartbeat = setInterval(() => {
      reply.raw.write(
        `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });

    return reply.hijack();
  });

  fastify.post('/messages/:messageId/retry', async (request) => {
    const { messageId } = messageParamsSchema.parse(request.params);
    const message = await retryMessage(fastify.sqlite, messageId);

    fastify.messageStreamBroker.publish({
      type: 'message.retried',
      at: message.updatedAt,
      conversationId: message.conversationId,
      messageId: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
    });

    void streamAssistantReply(
      fastify.sqlite,
      fastify.messageStreamBroker,
      message.id,
    );

    return presentMessage(await getMessageById(fastify.sqlite, message.id));
  });
};

export default messagesRoute;
