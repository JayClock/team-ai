import type {
  SessionContextPayload,
  SessionHistoryPayload,
  SessionListPayload,
  SessionPayload,
} from '../schemas/session';

function createSessionLinks(session: SessionPayload) {
  return {
    self: {
      href: `/api/sessions/${session.id}`,
    },
    project: {
      href: `/api/projects/${session.projectId}`,
    },
    collection: {
      href: `/api/projects/${session.projectId}/sessions`,
    },
    context: {
      href: `/api/sessions/${session.id}/context`,
    },
    history: {
      href: `/api/sessions/${session.id}/history`,
    },
  };
}

function presentSessionResource(session: SessionPayload) {
  return {
    _links: createSessionLinks(session),
    ...session,
  };
}

export function presentSession(session: SessionPayload) {
  return presentSessionResource(session);
}

export function presentSessionList(payload: SessionListPayload) {
  const searchParams = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.projectId) {
    searchParams.set('projectId', payload.projectId);
  }

  if (payload.status) {
    searchParams.set('status', payload.status);
  }

  const selfHref = payload.projectId
    ? `/api/projects/${payload.projectId}/sessions?page=${payload.page}&pageSize=${payload.pageSize}${payload.status ? `&status=${encodeURIComponent(payload.status)}` : ''}`
    : `/api/sessions?${searchParams.toString()}`;

  return {
    _links: {
      self: {
        href: selfHref,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      sessions: payload.items.map(presentSessionResource),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    total: payload.total,
  };
}

export function presentSessionContext(payload: SessionContextPayload) {
  return {
    _links: {
      self: {
        href: `/api/sessions/${payload.current.id}/context`,
      },
      session: {
        href: `/api/sessions/${payload.current.id}`,
      },
    },
    current: presentSessionResource(payload.current),
    parent: payload.parent ? presentSessionResource(payload.parent) : null,
    children: payload.children.map(presentSessionResource),
    siblings: payload.siblings.map(presentSessionResource),
    recentInWorkspace: payload.recentInWorkspace.map(presentSessionResource),
  };
}

export function presentSessionHistory(payload: SessionHistoryPayload) {
  return {
    _links: {
      self: {
        href: `/api/sessions/${payload.currentSessionId}/history`,
      },
      session: {
        href: `/api/sessions/${payload.currentSessionId}`,
      },
    },
    _embedded: {
      sessions: payload.items.map(presentSessionResource),
    },
    currentSessionId: payload.currentSessionId,
  };
}
