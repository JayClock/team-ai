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

const agentPatchSchema = agentBodySchema.partial().refine(
  (value) =>
    value.name !== undefined ||
    value.role !== undefined ||
    value.provider !== undefined ||
    value.model !== undefined ||
    value.systemPrompt !== undefined,
  'At least one field must be provided',
);

const agentParamsSchema = z.object({
  agentId: z.string().min(1),
});

const agentsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/agents', async (request) => {
    const query = listAgentsQuerySchema.parse(request.query);
    return presentAgentList(await listAgents(fastify.sqlite, query));
  });

  fastify.post('/agents', async (request, reply) => {
    const body = agentBodySchema.parse(request.body);
    const agent = await createAgent(fastify.sqlite, body);

    reply.code(201).header('Location', `/api/agents/${agent.id}`);
    return presentAgent(agent);
  });

  fastify.get('/agents/:agentId', async (request) => {
    const { agentId } = agentParamsSchema.parse(request.params);
    return presentAgent(await getAgentById(fastify.sqlite, agentId));
  });

  fastify.patch('/agents/:agentId', async (request) => {
    const { agentId } = agentParamsSchema.parse(request.params);
    const body = agentPatchSchema.parse(request.body);
    return presentAgent(await updateAgent(fastify.sqlite, agentId, body));
  });

  fastify.delete('/agents/:agentId', async (request, reply) => {
    const { agentId } = agentParamsSchema.parse(request.params);
    await deleteAgent(fastify.sqlite, agentId);
    reply.code(204).send();
  });
};

export default agentsRoute;
