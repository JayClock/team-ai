import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentProjectRuntimeProfile } from '../presenters/project-runtime-profile-presenter';
import { roleValues } from '../schemas/role';
import {
  getProjectRuntimeProfile,
  type UpdateProjectRuntimeProfileDeps,
  updateProjectRuntimeProfile,
} from '../services/project-runtime-profile-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const configEntrySchema = z.record(z.string(), z.unknown());
const configMapSchema = z.record(z.string(), configEntrySchema);
const roleDefaultSchema = z.object({
  model: nullableStringSchema,
  providerId: nullableStringSchema,
});
const roleDefaultsSchema = z.object(
  Object.fromEntries(
    roleValues.map((role) => [role, roleDefaultSchema.optional()]),
  ) as Record<(typeof roleValues)[number], z.ZodOptional<typeof roleDefaultSchema>>,
);

const runtimeProfilePatchSchema = z
  .object({
    defaultModel: nullableStringSchema.optional(),
    defaultProviderId: nullableStringSchema.optional(),
    enabledMcpServerIds: stringArraySchema.optional(),
    enabledSkillIds: stringArraySchema.optional(),
    mcpServerConfigs: configMapSchema.optional(),
    orchestrationMode: z.enum(['ROUTA', 'DEVELOPER']).optional(),
    roleDefaults: roleDefaultsSchema.optional(),
    skillConfigs: configMapSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

type RuntimeProfileRouteOptions = UpdateProjectRuntimeProfileDeps;

const runtimeProfileRoute: FastifyPluginAsync<RuntimeProfileRouteOptions> =
  async (fastify, options) => {
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
        await updateProjectRuntimeProfile(fastify.sqlite, projectId, body, {
          listProviderModels: options.listProviderModels,
        }),
      );
    },
  );
};

export default runtimeProfileRoute;
