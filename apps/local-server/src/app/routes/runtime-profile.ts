import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentProjectRuntimeProfile } from '../presenters/project-runtime-profile-presenter';
import {
  getProjectRuntimeProfile,
  updateProjectRuntimeProfile,
} from '../services/project-runtime-profile-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));

const runtimeProfilePatchSchema = z
  .object({
    defaultModel: nullableStringSchema.optional(),
    defaultProviderId: nullableStringSchema.optional(),
    enabledMcpServerIds: stringArraySchema.optional(),
    enabledSkillIds: stringArraySchema.optional(),
    orchestrationMode: z.enum(['ROUTA', 'DEVELOPER']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

const runtimeProfileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/projects/:projectId/runtime-profile',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.projectRuntimeProfile);

      return presentProjectRuntimeProfile(
        await getProjectRuntimeProfile(fastify.sqlite, projectId),
      );
    },
  );

  fastify.patch(
    '/projects/:projectId/runtime-profile',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = runtimeProfilePatchSchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.projectRuntimeProfile);

      return presentProjectRuntimeProfile(
        await updateProjectRuntimeProfile(fastify.sqlite, projectId, body),
      );
    },
  );
};

export default runtimeProfileRoute;
