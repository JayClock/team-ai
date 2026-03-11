import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentSpecialist,
  presentSpecialistList,
} from '../presenters/specialist-presenter';
import {
  getSpecialistById,
  listSpecialists,
} from '../services/specialist-service';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const specialistParamsSchema = z.object({
  projectId: z.string().min(1),
  specialistId: z.string().min(1),
});

const listQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
});

const specialistsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/specialists', async (request) => {
    const query = listQuerySchema.parse(request.query);
    return presentSpecialistList(
      await listSpecialists(fastify.sqlite, {
        projectId: query.projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/specialists', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return presentSpecialistList(
      await listSpecialists(fastify.sqlite, {
        projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/specialists/:specialistId', async (request) => {
    const { projectId, specialistId } = specialistParamsSchema.parse(request.params);
    return presentSpecialist(
      await getSpecialistById(fastify.sqlite, projectId, specialistId),
      projectId,
    );
  });
};

export default specialistsRoute;
