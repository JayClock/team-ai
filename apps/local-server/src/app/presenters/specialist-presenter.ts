import type {
  SpecialistListPayload,
  SpecialistPayload,
} from '../schemas/specialist';

function createSpecialistLinks(
  specialist: SpecialistPayload,
  projectId?: string,
) {
  const collectionHref = projectId
    ? `/api/projects/${projectId}/specialists`
    : '/api/specialists';

  return {
    self: {
      href: projectId
        ? `/api/projects/${projectId}/specialists/${specialist.id}`
        : `/api/specialists/${specialist.id}`,
    },
    update: projectId
      ? {
          href: `/api/projects/${projectId}/specialists/${specialist.id}`,
        }
      : undefined,
    delete: projectId
      ? {
          href: `/api/projects/${projectId}/specialists/${specialist.id}`,
        }
      : undefined,
    collection: {
      href: collectionHref,
    },
  };
}

function presentSpecialistResource(
  specialist: SpecialistPayload,
  projectId?: string,
) {
  return {
    _links: createSpecialistLinks(specialist, projectId),
    ...specialist,
  };
}

export function presentSpecialist(
  specialist: SpecialistPayload,
  projectId?: string,
) {
  return presentSpecialistResource(specialist, projectId);
}

export function presentSpecialistList(payload: SpecialistListPayload) {
  return {
    _links: {
      self: {
        href: payload.projectId
          ? `/api/projects/${payload.projectId}/specialists`
          : '/api/specialists',
      },
      create: payload.projectId
        ? {
            href: `/api/projects/${payload.projectId}/specialists`,
          }
        : undefined,
      root: {
        href: '/api',
      },
    },
    _embedded: {
      specialists: payload.items.map((specialist) =>
        presentSpecialistResource(specialist, payload.projectId),
      ),
    },
  };
}
