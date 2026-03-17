import type {
  AcpEventEnvelopePayload,
  AcpSessionListPayload,
  AcpSessionPayload,
} from '../schemas/acp';

function createSessionLinks(session: AcpSessionPayload) {
  return {
    self: {
      href: `/api/projects/${session.project.id}/acp-sessions/${session.id}`,
    },
    project: {
      href: `/api/projects/${session.project.id}`,
    },
    ...(session.codebase
      ? {
          codebase: {
            href: `/api/projects/${session.project.id}/codebases/${session.codebase.id}`,
          },
        }
      : {}),
    ...(session.worktree
      ? {
          worktree: {
            href: `/api/projects/${session.project.id}/worktrees/${session.worktree.id}`,
          },
        }
      : {}),
    history: {
      href: `/api/projects/${session.project.id}/acp-sessions/${session.id}/history`,
    },
    context: {
      href: `/api/projects/${session.project.id}/acp-sessions/${session.id}/context`,
    },
    notes: {
      href: `/api/projects/${session.project.id}/acp-sessions/${session.id}/notes`,
    },
    collection: {
      href: `/api/projects/${session.project.id}/acp-sessions`,
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
      href: `/api/projects/${projectId}/acp-sessions?${query.toString()}`,
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
      href: `/api/projects/${projectId}/acp-sessions?${nextQuery.toString()}`,
    };
  }

  if (page > 1) {
    const prevQuery = new URLSearchParams(query);
    prevQuery.set('page', String(page - 1));
    links.prev = {
      href: `/api/projects/${projectId}/acp-sessions?${prevQuery.toString()}`,
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
        href: `/api/projects/${projectId}/acp-sessions/${sessionId}/history`,
      },
      session: {
        href: `/api/projects/${projectId}/acp-sessions/${sessionId}`,
      },
    },
    projectId,
    sessionId,
    history,
  };
}
