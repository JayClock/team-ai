import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentRole, presentRoleList } from '../presenters/role-presenter';
import { getRoleById, listRoles } from '../services/role-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const roleParamsSchema = z.object({
  roleId: z.string().min(1),
});

const rolesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/roles', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.roles);

    return presentRoleList(await listRoles());
  });

  fastify.get('/roles/:roleId', async (request, reply) => {
    const { roleId } = roleParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.role);

    return presentRole(await getRoleById(roleId));
  });
};

export default rolesRoute;
