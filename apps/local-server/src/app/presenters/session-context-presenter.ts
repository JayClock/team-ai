import type { AcpSessionContextPayload } from '../schemas/session-context';

export function presentAcpSessionContext(context: AcpSessionContextPayload) {
  return {
    _links: {
      project: {
        href: `/api/projects/${context.projectId}`,
      },
      self: {
        href: `/api/projects/${context.projectId}/acp-sessions/${context.sessionId}/context`,
      },
      session: {
        href: `/api/projects/${context.projectId}/acp-sessions/${context.sessionId}`,
      },
      ...(context.task
        ? {
            task: {
              href: `/api/tasks/${context.task.id}`,
            },
          }
        : {}),
      ...(context.worktree
        ? {
            worktree: {
              href: `/api/projects/${context.projectId}/worktrees/${context.worktree.id}`,
            },
          }
        : {}),
    },
    ...context,
  };
}
