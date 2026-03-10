import type {
  AcpEventEnvelopePayload,
  AcpSessionListPayload,
  AcpSessionPayload,
} from '../schemas/acp';

function createSessionLinks(session: AcpSessionPayload) {
  return {
    self: {
      href: `/api/projects/${session.project.id}/sessions/${session.id}`,
    },
    project: {
      href: `/api/projects/${session.project.id}`,
    },
    history: {
      href: `/api/projects/${session.project.id}/sessions/${session.id}/history`,
    },
    collection: {
      href: `/api/projects/${session.project.id}/sessions`,
    },
  };
}

export function presentAcpSession(session: AcpSessionPayload) {
  return {
    _links: createSessionLinks(session),
    ...session,
  };
}

export function presentAcpSessionList(payload: AcpSessionListPayload) {
  const { items, page, pageSize, projectId, total } = payload;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  const links: Record<string, { href: string }> = {
    self: {
      href: `/api/projects/${projectId}/sessions?${query.toString()}`,
    },
    project: {
      href: `/api/projects/${projectId}`,
    },
    root: {
      href: '/api',
    },
  };

  if (page * pageSize < total) {
    const nextQuery = new URLSearchParams(query);
    nextQuery.set('page', String(page + 1));
    links.next = {
      href: `/api/projects/${projectId}/sessions?${nextQuery.toString()}`,
    };
  }

  if (page > 1) {
    const prevQuery = new URLSearchParams(query);
    prevQuery.set('page', String(page - 1));
    links.prev = {
      href: `/api/projects/${projectId}/sessions?${prevQuery.toString()}`,
    };
  }

  return {
    _links: links,
    _embedded: {
      sessions: items.map((session) => ({
        _links: createSessionLinks(session),
        ...session,
      })),
    },
    page,
    pageSize,
    projectId,
    total,
  };
}

export function presentAcpHistory(
  projectId: string,
  sessionId: string,
  history: AcpEventEnvelopePayload[],
) {
  return {
    _links: {
      self: {
        href: `/api/projects/${projectId}/sessions/${sessionId}/history`,
      },
      session: {
        href: `/api/projects/${projectId}/sessions/${sessionId}`,
      },
    },
    projectId,
    sessionId,
    history,
  };
}
