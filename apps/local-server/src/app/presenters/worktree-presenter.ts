import type {
  WorktreeListPayload,
  WorktreePayload,
} from '../schemas/worktree';

function createWorktreeLinks(worktree: WorktreePayload) {
  return {
    self: {
      href: `/api/projects/${worktree.projectId}/worktrees/${worktree.id}`,
    },
    collection: {
      href: `/api/projects/${worktree.projectId}/codebases/${worktree.codebaseId}/worktrees`,
    },
    codebase: {
      href: `/api/projects/${worktree.projectId}/codebases/${worktree.codebaseId}`,
    },
    project: {
      href: `/api/projects/${worktree.projectId}`,
    },
    ...(worktree.sessionId
      ? {
          session: {
            href: `/api/projects/${worktree.projectId}/acp-sessions/${worktree.sessionId}`,
          },
        }
      : {}),
  };
}

function presentWorktreeResource(worktree: WorktreePayload) {
  return {
    _links: createWorktreeLinks(worktree),
    ...worktree,
  };
}

export function presentWorktree(worktree: WorktreePayload) {
  return presentWorktreeResource(worktree);
}

export function presentWorktreeList(payload: WorktreeListPayload) {
  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/codebases/${payload.codebaseId}/worktrees`,
      },
      codebase: {
        href: `/api/projects/${payload.projectId}/codebases/${payload.codebaseId}`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      worktrees: payload.items.map(presentWorktreeResource),
    },
  };
}
