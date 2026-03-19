import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentSpecialist,
  presentSpecialistList,
} from '../presenters/specialist-presenter';
import {
  deleteSpecialist,
  getSpecialistById,
  listSpecialists,
  upsertSpecialist,
} from '../services/specialist-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const specialistParamsSchema = z.object({
  projectId: z.string().min(1),
  specialistId: z.string().min(1),
});

const specialistBodySchema = z.object({
  defaultAdapter: z.union([z.string().trim().min(1), z.null()]).optional(),
  definitionContent: z.string().min(1).optional(),
  description: z.union([z.string().trim().min(1), z.null()]).optional(),
  format: z.enum(['json', 'markdown']).optional(),
  id: z.string().trim().min(1),
  modelTier: z.union([z.string().trim().min(1), z.null()]).optional(),
  name: z.string().trim().min(1).optional(),
  role: z.enum(['ROUTA', 'CRAFTER', 'GATE', 'DEVELOPER']).optional(),
  roleReminder: z.union([z.string().trim().min(1), z.null()]).optional(),
  systemPrompt: z.string().min(1).optional(),
});

const specialistPatchSchema = z
  .object({
    defaultAdapter: z.union([z.string().trim().min(1), z.null()]).optional(),
    definitionContent: z.string().min(1).optional(),
    description: z.union([z.string().trim().min(1), z.null()]).optional(),
    format: z.enum(['json', 'markdown']).optional(),
    modelTier: z.union([z.string().trim().min(1), z.null()]).optional(),
    name: z.string().trim().min(1).optional(),
    role: z.enum(['ROUTA', 'CRAFTER', 'GATE', 'DEVELOPER']).optional(),
    roleReminder: z.union([z.string().trim().min(1), z.null()]).optional(),
    systemPrompt: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one specialist field must be provided',
  });

const listQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
});

const specialistsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/specialists', async (request, reply) => {
    const query = listQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialists);

    return presentSpecialistList(
      await listSpecialists(fastify.sqlite, {
        projectId: query.projectId,
      }),
    );
  });

  fastify.get('/projects/:projectId/specialists', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialists);

    return presentSpecialistList(
      await listSpecialists(fastify.sqlite, {
        projectId,
      }),
    );
  });

  fastify.post('/projects/:projectId/specialists', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = specialistBodySchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialist);
    reply.code(201);

    return presentSpecialist(
      await upsertSpecialist(fastify.sqlite, {
        ...body,
        projectId,
      }),
      projectId,
    );
  });

  fastify.get(
    '/projects/:projectId/specialists/:specialistId',
    async (request, reply) => {
      const { projectId, specialistId } = specialistParamsSchema.parse(
        request.params,
      );
      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialist);

      return presentSpecialist(
        await getSpecialistById(fastify.sqlite, projectId, specialistId),
        projectId,
      );
    },
  );

  fastify.patch(
    '/projects/:projectId/specialists/:specialistId',
    async (request, reply) => {
      const { projectId, specialistId } = specialistParamsSchema.parse(
        request.params,
      );
      const body = specialistPatchSchema.parse(request.body);
      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialist);

      return presentSpecialist(
        await upsertSpecialist(fastify.sqlite, {
          ...body,
          id: specialistId,
          projectId,
        }),
        projectId,
      );
    },
  );

  fastify.delete(
    '/projects/:projectId/specialists/:specialistId',
    async (request, reply) => {
      const { projectId, specialistId } = specialistParamsSchema.parse(
        request.params,
      );
      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.specialist);

      return presentSpecialist(
        await deleteSpecialist(fastify.sqlite, {
          projectId,
          specialistId,
        }),
        projectId,
      );
    },
  );
};

export default specialistsRoute;
