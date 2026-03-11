import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentRole, presentRoleList } from '../presenters/role-presenter';
import { getRoleById, listRoles } from '../services/role-service';

const roleParamsSchema = z.object({
  roleId: z.string().min(1),
});

const rolesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/roles', async () => {
    return presentRoleList(await listRoles());
  });

  fastify.get('/roles/:roleId', async (request) => {
    const { roleId } = roleParamsSchema.parse(request.params);
    return presentRole(await getRoleById(roleId));
  });
};

export default rolesRoute;
