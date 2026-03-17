import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentFlow, presentFlowList } from '../presenters/flow-presenter';
import { getFlowById, listFlows } from '../services/flow-service';
import { listFlowRuns, triggerFlow } from '../services/flow-runtime-service';
import { presentWorkflowRun, presentWorkflowRunList } from '../presenters/workflow-presenter';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const flowParamsSchema = z.object({
  flowId: z.string().min(1),
  projectId: z.string().min(1),
});

const triggerFlowBodySchema = z.object({
  triggerPayload: z.union([z.string().trim().min(1), z.null()]).optional(),
  triggerSource: z.enum(['manual', 'schedule', 'webhook']).optional(),
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

  fastify.post(
    '/projects/:projectId/flows/:flowId/trigger',
    async (request, reply) => {
      const { flowId, projectId } = flowParamsSchema.parse(request.params);
      const body = triggerFlowBodySchema.parse(request.body ?? {});
      const result = await triggerFlow(fastify.sqlite, {
        flowId,
        projectId,
        triggerPayload: body.triggerPayload,
        triggerSource: body.triggerSource,
      });

      reply.code(202).type(VENDOR_MEDIA_TYPES.workflowRun);
      return presentWorkflowRun(result.workflowRun);
    },
  );

  fastify.get(
    '/projects/:projectId/flows/:flowId/runs',
    async (request, reply) => {
      const { flowId, projectId } = flowParamsSchema.parse(request.params);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.workflowRuns);

      return presentWorkflowRunList(
        await listFlowRuns(fastify.sqlite, projectId, flowId),
      );
    },
  );
};

export default flowsRoute;
