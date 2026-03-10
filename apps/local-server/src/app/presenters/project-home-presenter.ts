import type { ProjectHomePayload } from '../schemas/project-home';

function createSessionLinks(sessionId: string) {
  return {
    self: {
      href: `/api/sessions/${sessionId}`,
    },
    steps: {
      href: `/api/sessions/${sessionId}/steps`,
    },
    events: {
      href: `/api/sessions/${sessionId}/events`,
    },
  };
}

export function presentProjectHome(payload: ProjectHomePayload) {
  return {
    _links: {
      self: {
        href: `/api/projects/${payload.project.id}/home`,
      },
      project: {
        href: `/api/projects/${payload.project.id}`,
      },
      sessions: {
        href: `/api/projects/${payload.project.id}/sessions`,
      },
    },
    ...payload,
    latestSession: payload.latestSession
      ? {
          _links: createSessionLinks(payload.latestSession.id),
          ...payload.latestSession,
        }
      : null,
    recentSessions: payload.recentSessions.map((session) => ({
      _links: createSessionLinks(session.id),
      ...session,
    })),
  };
}
