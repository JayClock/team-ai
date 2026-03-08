import type {
  ProjectListPayload,
  ProjectPayload,
} from '../schemas/project';

function createProjectLinks(project: ProjectPayload) {
  return {
    self: {
      href: `/api/projects/${project.id}`,
    },
    collection: {
      href: '/api/projects',
    },
    conversations: {
      href: `/api/projects/${project.id}/conversations`,
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
  const { items, page, pageSize, q, total } = payload;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (q) {
    query.set('q', q);
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
