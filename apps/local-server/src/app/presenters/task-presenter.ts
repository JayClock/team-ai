import type { TaskListPayload, TaskPayload } from '../schemas/task';

function createTaskLinks(task: TaskPayload) {
  return {
    self: {
      href: `/api/tasks/${task.id}`,
    },
    collection: {
      href: '/api/tasks',
    },
    project: {
      href: `/api/projects/${task.projectId}`,
    },
    ...(task.triggerSessionId
      ? {
          session: {
            href: `/api/projects/${task.projectId}/acp-sessions/${task.triggerSessionId}`,
          },
        }
      : {}),
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

  if (payload.projectId) {
    searchParams.set('projectId', payload.projectId);
  }

  if (payload.sessionId) {
    searchParams.set('sessionId', payload.sessionId);
  }

  if (payload.status) {
    searchParams.set('status', payload.status);
  }

  const selfHref = payload.sessionId
    ? payload.projectId
      ? `/api/projects/${payload.projectId}/acp-sessions/${payload.sessionId}/tasks?page=${payload.page}&pageSize=${payload.pageSize}${payload.status ? `&status=${encodeURIComponent(payload.status)}` : ''}`
      : `/api/tasks?${searchParams.toString()}`
    : payload.projectId
      ? `/api/projects/${payload.projectId}/tasks?page=${payload.page}&pageSize=${payload.pageSize}${payload.status ? `&status=${encodeURIComponent(payload.status)}` : ''}`
      : `/api/tasks?${searchParams.toString()}`;

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
