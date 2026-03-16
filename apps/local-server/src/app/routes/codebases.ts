import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentCodebase,
  presentCodebaseList,
} from '../presenters/codebase-presenter';
import {
  cloneProjectCodebase,
  deleteProjectCodebaseById,
  getProjectCodebaseById,
  listProjectCodebases,
} from '../services/project-codebase-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const codebaseParamsSchema = z.object({
  codebaseId: z.string().min(1),
  projectId: z.string().min(1),
});

const cloneProjectCodebaseBodySchema = z.object({
  repositoryUrl: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
});

const deleteCodebaseQuerySchema = z.object({
  deleteBranches: z.coerce.boolean().optional(),
});

const codebasesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/codebases', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.codebases);

    return presentCodebaseList(
      await listProjectCodebases(fastify.sqlite, projectId),
    );
  });

  fastify.get(
    '/projects/:projectId/codebases/:codebaseId',
    async (request, reply) => {
      const { codebaseId, projectId } = codebaseParamsSchema.parse(
        request.params,
      );

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.codebase);

      return presentCodebase(
        await getProjectCodebaseById(fastify.sqlite, projectId, codebaseId),
      );
    },
  );

  fastify.post('/projects/:projectId/codebases/clone', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = cloneProjectCodebaseBodySchema.parse(request.body);
    const result = await cloneProjectCodebase(fastify.sqlite, projectId, body);

    reply
      .code(result.cloneStatus === 'cloned' ? 201 : 200)
      .header(
        'Location',
        `/api/projects/${projectId}/codebases/${result.codebase.id}`,
      )
      .type(VENDOR_MEDIA_TYPES.codebase);

    return {
      cloneStatus: result.cloneStatus,
      codebase: presentCodebase(result.codebase),
    };
  });

  fastify.delete(
    '/projects/:projectId/codebases/:codebaseId',
    async (request, reply) => {
      const { codebaseId, projectId } = codebaseParamsSchema.parse(
        request.params,
      );
      const query = deleteCodebaseQuerySchema.parse(request.query);

      await deleteProjectCodebaseById(
        fastify.sqlite,
        projectId,
        codebaseId,
        query,
      );
      reply.code(204).send();
    },
  );
};

export default codebasesRoute;
