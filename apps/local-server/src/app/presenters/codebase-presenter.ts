import type {
  CodebaseListPayload,
  CodebasePayload,
} from '../schemas/codebase';

function createCodebaseLinks(codebase: CodebasePayload) {
  return {
    self: {
      href: `/api/projects/${codebase.projectId}/codebases/${codebase.id}`,
    },
    collection: {
      href: `/api/projects/${codebase.projectId}/codebases`,
    },
    worktrees: {
      href: `/api/projects/${codebase.projectId}/codebases/${codebase.id}/worktrees`,
    },
    project: {
      href: `/api/projects/${codebase.projectId}`,
    },
  };
}

function presentCodebaseResource(codebase: CodebasePayload) {
  return {
    _links: createCodebaseLinks(codebase),
    ...codebase,
  };
}

export function presentCodebase(codebase: CodebasePayload) {
  return presentCodebaseResource(codebase);
}

export function presentCodebaseList(payload: CodebaseListPayload) {
  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/codebases`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      codebases: payload.items.map(presentCodebaseResource),
    },
  };
}
