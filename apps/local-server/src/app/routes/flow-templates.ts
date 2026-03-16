import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { applyFlowTemplate } from '../services/apply-flow-template-service';
import {
  getFlowTemplateById,
  listFlowTemplates,
} from '../services/flow-template-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const templateParamsSchema = z.object({
  projectId: z.string().min(1),
  templateId: z.string().min(1),
});

const listFlowTemplatesQuerySchema = z.object({
  noteType: z.enum(['general', 'spec', 'task']).optional(),
});

const applyTemplateBodySchema = z.object({
  mergeStrategy: z.enum(['append', 'replace']).default('replace'),
  noteId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  variables: z.record(z.string(), z.string()).default({}),
});

const flowTemplatesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/flow-templates', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listFlowTemplatesQuerySchema.parse(request.query);

    return listFlowTemplates(fastify.sqlite, {
      noteType: query.noteType,
      projectId,
    });
  });

  fastify.get(
    '/projects/:projectId/flow-templates/:templateId',
    async (request) => {
      const { projectId, templateId } = templateParamsSchema.parse(
        request.params,
      );

      return getFlowTemplateById(fastify.sqlite, projectId, templateId);
    },
  );

  fastify.post(
    '/projects/:projectId/flow-templates/:templateId/apply',
    async (request, reply) => {
      const { projectId, templateId } = templateParamsSchema.parse(
        request.params,
      );
      const body = applyTemplateBodySchema.parse(request.body ?? {});
      const result = await applyFlowTemplate(fastify.sqlite, {
        mergeStrategy: body.mergeStrategy,
        noteId: body.noteId,
        projectId,
        sessionId: body.sessionId,
        templateId,
        title: body.title,
        variables: body.variables,
      });

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.note);

      return result;
    },
  );
};

export default flowTemplatesRoute;
