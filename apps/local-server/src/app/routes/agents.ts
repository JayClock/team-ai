import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentAgent, presentAgentList } from '../presenters/agent-presenter';
import {
  createAgent,
  deleteAgent,
  getAgentById,
  listAgents,
  updateAgent,
} from '../services/agent-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listAgentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const agentBodySchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  systemPrompt: z.string().optional().nullable(),
});

const agentPatchSchema = agentBodySchema
  .partial()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.role !== undefined ||
      value.provider !== undefined ||
      value.model !== undefined ||
      value.systemPrompt !== undefined,
    'At least one field must be provided',
  );

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const projectAgentParamsSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1),
});

const agentsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/agents', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listAgentsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.agents);

    return presentAgentList(
      await listAgents(fastify.sqlite, { ...query, projectId }),
    );
  });

  fastify.post('/projects/:projectId/agents', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = agentBodySchema.parse(request.body);
    const agent = await createAgent(fastify.sqlite, {
      ...body,
      projectId,
    });

    reply
      .code(201)
      .header('Location', `/api/projects/${projectId}/agents/${agent.id}`)
      .type(VENDOR_MEDIA_TYPES.agent);
    return presentAgent(agent);
  });

  fastify.get(
    '/projects/:projectId/agents/:agentId',
    async (request, reply) => {
      const { projectId, agentId } = projectAgentParamsSchema.parse(
        request.params,
      );

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.agent);

      return presentAgent(
        await getAgentById(fastify.sqlite, projectId, agentId),
      );
    },
  );

  fastify.patch(
    '/projects/:projectId/agents/:agentId',
    async (request, reply) => {
      const { projectId, agentId } = projectAgentParamsSchema.parse(
        request.params,
      );
      const body = agentPatchSchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.agent);

      return presentAgent(
        await updateAgent(fastify.sqlite, projectId, agentId, body),
      );
    },
  );

  fastify.delete(
    '/projects/:projectId/agents/:agentId',
    async (request, reply) => {
      const { projectId, agentId } = projectAgentParamsSchema.parse(
        request.params,
      );
      await deleteAgent(fastify.sqlite, projectId, agentId);
      reply.code(204).send();
    },
  );
};

export default agentsRoute;
