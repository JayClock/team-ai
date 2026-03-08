import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentConversation,
  presentConversationList,
} from '../presenters/conversation-presenter';
import {
  createConversation,
  deleteConversation,
  getConversationById,
  listConversationsByProject,
  updateConversation,
} from '../services/conversation-service';

const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const createConversationBodySchema = z.object({
  title: z.string().trim().min(1),
});

const updateConversationBodySchema = z.object({
  title: z.string().trim().min(1),
});

const projectConversationParamsSchema = z.object({
  projectId: z.string().min(1),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1),
});

const conversationsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/conversations', async (request) => {
    const { projectId } = projectConversationParamsSchema.parse(request.params);
    const query = listConversationsQuerySchema.parse(request.query);

    return presentConversationList(
      await listConversationsByProject(fastify.sqlite, projectId, query),
    );
  });

  fastify.post('/projects/:projectId/conversations', async (request, reply) => {
    const { projectId } = projectConversationParamsSchema.parse(request.params);
    const body = createConversationBodySchema.parse(request.body);
    const conversation = await createConversation(
      fastify.sqlite,
      projectId,
      body,
    );

    reply
      .code(201)
      .header('Location', `/api/conversations/${conversation.id}`);

    return presentConversation(conversation);
  });

  fastify.get('/conversations/:conversationId', async (request) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);

    return presentConversation(
      await getConversationById(fastify.sqlite, conversationId),
    );
  });

  fastify.patch('/conversations/:conversationId', async (request) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const body = updateConversationBodySchema.parse(request.body);

    return presentConversation(
      await updateConversation(fastify.sqlite, conversationId, body),
    );
  });

  fastify.delete('/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = conversationParamsSchema.parse(request.params);
    await deleteConversation(fastify.sqlite, conversationId);
    reply.code(204).send();
  });
};

export default conversationsRoute;
