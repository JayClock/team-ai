import type { TaskListPayload, TaskPayload } from '../schemas/task';

const executableTaskStatuses = new Set([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'FAILED',
  'CANCELLED',
]);

function shouldExposeExecuteLink(task: TaskPayload): boolean {
  return (
    (task.kind === 'implement' ||
      task.kind === 'review' ||
      task.kind === 'verify') &&
    !task.executionSessionId &&
    executableTaskStatuses.has(task.status)
  );
}

function createTaskLinks(task: TaskPayload) {
  return {
    self: {
      href: `/api/tasks/${task.id}`,
    },
    collection: {
      href: `/api/projects/${task.projectId}/tasks`,
    },
    project: {
      href: `/api/projects/${task.projectId}`,
    },
    ...(task.parentTaskId
      ? {
          parent: {
            href: `/api/tasks/${task.parentTaskId}`,
          },
        }
      : {}),
    ...(task.executionSessionId
      ? {
          execution: {
            href: `/api/projects/${task.projectId}/acp-sessions/${task.executionSessionId}`,
          },
        }
      : {}),
    ...(task.resultSessionId
      ? {
          result: {
            href: `/api/projects/${task.projectId}/acp-sessions/${task.resultSessionId}`,
          },
        }
      : {}),
    runs: {
      href: `/api/tasks/${task.id}/runs`,
    },
    ...(shouldExposeExecuteLink(task)
      ? {
          execute: {
            href: `/api/tasks/${task.id}/execute`,
          },
        }
      : {}),
  };
}

function presentTaskResource(task: TaskPayload) {
  return {
    _links: createTaskLinks(task),
    ...task,
  };
}

export function presentTask(task: TaskPayload) {
  return presentTaskResource(task);
}

export function presentTaskList(payload: TaskListPayload) {
  const searchParams = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.sessionId) {
    searchParams.set('sessionId', payload.sessionId);
  }

  if (payload.status) {
    searchParams.set('status', payload.status);
  }

  const selfHref = payload.projectId
    ? `/api/projects/${payload.projectId}/tasks?${searchParams.toString()}`
    : (() => {
        if (payload.projectId) {
          searchParams.set('projectId', payload.projectId);
        }
        return `/api/tasks?${searchParams.toString()}`;
      })();

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
      tasks: payload.items.map(presentTaskResource),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    total: payload.total,
  };
}
