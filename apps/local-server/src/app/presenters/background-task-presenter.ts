import type {
  BackgroundTaskListPayload,
  BackgroundTaskPayload,
} from '../schemas/background-task';

function createBackgroundTaskLinks(task: BackgroundTaskPayload) {
  return {
    self: {
      href: `/api/background-tasks/${task.id}`,
    },
    collection: {
      href: `/api/projects/${task.projectId}/background-tasks`,
    },
    project: {
      href: `/api/projects/${task.projectId}`,
    },
    ...(task.taskId
      ? {
          task: {
            href: `/api/tasks/${task.taskId}`,
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
  };
}

function presentBackgroundTaskResource(task: BackgroundTaskPayload) {
  return {
    _links: createBackgroundTaskLinks(task),
    ...task,
  };
}

export function presentBackgroundTask(task: BackgroundTaskPayload) {
  return presentBackgroundTaskResource(task);
}

export function presentBackgroundTaskList(payload: BackgroundTaskListPayload) {
  const query = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.status) {
    query.set('status', payload.status);
  }

  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/background-tasks?${query.toString()}`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      backgroundTasks: payload.items.map(presentBackgroundTaskResource),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    total: payload.total,
  };
}
