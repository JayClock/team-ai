import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentWorktree,
  presentWorktreeList,
} from '../presenters/worktree-presenter';
import {
  createProjectWorktree,
  getProjectWorktreeById,
  listProjectWorktrees,
  removeProjectWorktree,
  validateProjectWorktree,
} from '../services/project-worktree-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const codebaseParamsSchema = z.object({
  codebaseId: z.string().min(1),
  projectId: z.string().min(1),
});

const worktreeParamsSchema = z.object({
  projectId: z.string().min(1),
  worktreeId: z.string().min(1),
});

const createWorktreeBodySchema = z.object({
  branch: z.string().trim().min(1).optional(),
  baseBranch: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  worktreeRoot: z.string().trim().min(1).optional(),
});

const deleteWorktreeQuerySchema = z.object({
  deleteBranch: z.coerce.boolean().optional(),
});

const worktreesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/projects/:projectId/codebases/:codebaseId/worktrees',
    async (request, reply) => {
      const { projectId, codebaseId } = codebaseParamsSchema.parse(request.params);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.worktrees);

      return presentWorktreeList(
        await listProjectWorktrees(fastify.sqlite, projectId, codebaseId),
      );
    },
  );

  fastify.post(
    '/projects/:projectId/codebases/:codebaseId/worktrees',
    async (request, reply) => {
      const { projectId, codebaseId } = codebaseParamsSchema.parse(request.params);
      const body = createWorktreeBodySchema.parse(request.body ?? {});
      const worktree = await createProjectWorktree(
        fastify.sqlite,
        projectId,
        codebaseId,
        body,
      );

      reply
        .code(201)
        .header('Location', `/api/projects/${projectId}/worktrees/${worktree.id}`)
        .type(VENDOR_MEDIA_TYPES.worktree);

      return presentWorktree(worktree);
    },
  );

  fastify.get('/projects/:projectId/worktrees/:worktreeId', async (request, reply) => {
    const { projectId, worktreeId } = worktreeParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.worktree);

    return presentWorktree(
      await getProjectWorktreeById(fastify.sqlite, projectId, worktreeId),
    );
  });

  fastify.delete(
    '/projects/:projectId/worktrees/:worktreeId',
    async (request, reply) => {
      const { projectId, worktreeId } = worktreeParamsSchema.parse(request.params);
      const query = deleteWorktreeQuerySchema.parse(request.query);

      await removeProjectWorktree(fastify.sqlite, projectId, worktreeId, query);
      reply.code(204).send();
    },
  );

  fastify.post(
    '/projects/:projectId/worktrees/:worktreeId/validate',
    async (request, reply) => {
      const { projectId, worktreeId } = worktreeParamsSchema.parse(request.params);
      const result = await validateProjectWorktree(
        fastify.sqlite,
        projectId,
        worktreeId,
      );

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.worktree);

      return result;
    },
  );
};

export default worktreesRoute;
