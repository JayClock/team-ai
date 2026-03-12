import type { ProjectRuntimeProfilePayload } from '../schemas/runtime-profile';

export function presentProjectRuntimeProfile(
  profile: ProjectRuntimeProfilePayload,
) {
  return {
    _links: {
      self: {
        href: `/api/projects/${profile.projectId}/runtime-profile`,
      },
      project: {
        href: `/api/projects/${profile.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    ...profile,
  };
}
