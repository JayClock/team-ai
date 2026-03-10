import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentProjectHome } from '../presenters/project-home-presenter';
import { getProjectHome } from '../services/project-home-service';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const projectHomeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/home', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return presentProjectHome(await getProjectHome(fastify.sqlite, projectId));
  });
};

export default projectHomeRoute;
