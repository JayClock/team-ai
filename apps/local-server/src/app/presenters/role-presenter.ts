import type { RoleListPayload, RolePayload } from '../schemas/role';

function createRoleLinks(role: RolePayload) {
  return {
    self: {
      href: `/api/roles/${role.id}`,
    },
    collection: {
      href: '/api/roles',
    },
  };
}

function presentRoleResource(role: RolePayload) {
  return {
    _links: createRoleLinks(role),
    ...role,
  };
}

export function presentRole(role: RolePayload) {
  return presentRoleResource(role);
}

export function presentRoleList(payload: RoleListPayload) {
  return {
    _links: {
      self: {
        href: '/api/roles',
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      roles: payload.items.map(presentRoleResource),
    },
  };
}
