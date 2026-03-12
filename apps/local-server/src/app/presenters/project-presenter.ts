import type { ProjectListPayload, ProjectPayload } from '../schemas/project';

function createProjectLinks(project: ProjectPayload) {
  return {
    self: {
      href: `/api/projects/${project.id}`,
    },
    collection: {
      href: '/api/projects',
    },
    tasks: {
      href: `/api/projects/${project.id}/tasks`,
    },
    notes: {
      href: `/api/projects/${project.id}/notes`,
    },
    'note-events': {
      href: `/api/projects/${project.id}/note-events`,
    },
    'task-runs': {
      href: `/api/projects/${project.id}/task-runs`,
    },
    agents: {
      href: `/api/projects/${project.id}/agents`,
    },
    specialists: {
      href: `/api/projects/${project.id}/specialists`,
    },
    roles: {
      href: '/api/roles',
    },
    'acp-sessions': {
      href: `/api/projects/${project.id}/acp-sessions`,
    },
  };
}

export function presentProject(project: ProjectPayload) {
  return {
    _links: createProjectLinks(project),
    ...project,
  };
}

export function presentProjectList(payload: ProjectListPayload) {
  const { items, page, pageSize, q, repoPath, sourceUrl, total } = payload;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (q) {
    query.set('q', q);
  }

  if (repoPath) {
    query.set('repoPath', repoPath);
  }

  if (sourceUrl) {
    query.set('sourceUrl', sourceUrl);
  }

  return {
    _links: {
      self: {
        href: `/api/projects?${query.toString()}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      projects: items.map((project) => ({
        _links: createProjectLinks(project),
        ...project,
      })),
    },
    page,
    pageSize,
    total,
  };
}
