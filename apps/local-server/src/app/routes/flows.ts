import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentFlow, presentFlowList } from '../presenters/flow-presenter';
import { getFlowById, listFlows } from '../services/flow-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const flowParamsSchema = z.object({
  flowId: z.string().min(1),
  projectId: z.string().min(1),
});

const flowsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/flows', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.flows);

    return presentFlowList(await listFlows(fastify.sqlite, projectId));
  });

  fastify.get('/projects/:projectId/flows/:flowId', async (request, reply) => {
    const { flowId, projectId } = flowParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.flow);

    return presentFlow(
      await getFlowById(fastify.sqlite, projectId, flowId),
      projectId,
    );
  });
};

export default flowsRoute;
