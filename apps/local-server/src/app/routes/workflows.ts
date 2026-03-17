import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentWorkflow,
  presentWorkflowList,
  presentWorkflowRun,
  presentWorkflowRunList,
} from '../presenters/workflow-presenter';
import {
  cancelWorkflowRunById,
  createWorkflow,
  getWorkflowById,
  getWorkflowRunById,
  listProjectWorkflows,
  listWorkflowRuns,
  reconcileWorkflowRunById,
  triggerWorkflow,
} from '../services/workflow-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const workflowParamsSchema = z.object({
  workflowId: z.string().min(1),
});

const workflowRunParamsSchema = z.object({
  workflowRunId: z.string().min(1),
});

const workflowStepSchema = z.object({
  name: z.string().trim().min(1),
  parallelGroup: z.union([z.string().trim().min(1), z.null()]).optional(),
  prompt: z.string().trim().min(1),
  specialistId: z.string().trim().min(1),
});

const createWorkflowBodySchema = z.object({
  description: z.union([z.string().trim().min(1), z.null()]).optional(),
  name: z.string().trim().min(1),
  steps: z.array(workflowStepSchema).min(1),
  version: z.number().int().positive().optional(),
});

const triggerWorkflowBodySchema = z.object({
  triggerPayload: z.union([z.string().trim().min(1), z.null()]).optional(),
  triggerSource: z.enum(['manual', 'schedule', 'webhook']).optional(),
});

const workflowsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/workflows', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.workflows);

    return presentWorkflowList(
      await listProjectWorkflows(fastify.sqlite, projectId),
    );
  });

  fastify.post('/projects/:projectId/workflows', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createWorkflowBodySchema.parse(request.body);
    const workflow = await createWorkflow(fastify.sqlite, {
      ...body,
      projectId,
      steps: body.steps.map((step) => ({
        ...step,
        parallelGroup: step.parallelGroup ?? null,
      })),
    });

    reply
      .code(201)
      .header('Location', `/api/workflows/${workflow.id}`)
      .type(VENDOR_MEDIA_TYPES.workflow);
    return presentWorkflow(workflow);
  });

  fastify.get('/workflows/:workflowId', async (request, reply) => {
    const { workflowId } = workflowParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.workflow);

    return presentWorkflow(await getWorkflowById(fastify.sqlite, workflowId));
  });

  fastify.post('/workflows/:workflowId/trigger', async (request, reply) => {
    const { workflowId } = workflowParamsSchema.parse(request.params);
    const body = triggerWorkflowBodySchema.parse(request.body ?? {});
    const result = await triggerWorkflow(fastify.sqlite, workflowId, body);

    reply.code(202).type(VENDOR_MEDIA_TYPES.workflowRun);
    return presentWorkflowRun(result.workflowRun);
  });

  fastify.get('/workflows/:workflowId/runs', async (request, reply) => {
    const { workflowId } = workflowParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.workflowRuns);

    return presentWorkflowRunList(
      await listWorkflowRuns(fastify.sqlite, workflowId),
    );
  });

  fastify.get('/workflow-runs/:workflowRunId', async (request, reply) => {
    const { workflowRunId } = workflowRunParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.workflowRun);

    return presentWorkflowRun(
      getWorkflowRunById(fastify.sqlite, workflowRunId),
    );
  });

  fastify.post('/workflow-runs/:workflowRunId/reconcile', async (request, reply) => {
    const { workflowRunId } = workflowRunParamsSchema.parse(request.params);

    reply.code(202).type(VENDOR_MEDIA_TYPES.workflowRun);
    return presentWorkflowRun(
      reconcileWorkflowRunById(fastify.sqlite, workflowRunId),
    );
  });

  fastify.post('/workflow-runs/:workflowRunId/cancel', async (request, reply) => {
    const { workflowRunId } = workflowRunParamsSchema.parse(request.params);

    reply.code(202).type(VENDOR_MEDIA_TYPES.workflowRun);
    return presentWorkflowRun(
      await cancelWorkflowRunById(fastify.sqlite, workflowRunId),
    );
  });
};

export default workflowsRoute;
