import type { TaskRunListPayload, TaskRunPayload } from '../schemas/task-run';

const retryableTaskRunStatuses = new Set(['FAILED', 'CANCELLED']);

function createCollectionHref(taskRun: TaskRunPayload) {
  return `/api/tasks/${taskRun.taskId}/runs`;
}

function createTaskRunLinks(taskRun: TaskRunPayload) {
  return {
    self: {
      href: `/api/task-runs/${taskRun.id}`,
    },
    collection: {
      href: createCollectionHref(taskRun),
    },
    project: {
      href: `/api/projects/${taskRun.projectId}`,
    },
    task: {
      href: `/api/tasks/${taskRun.taskId}`,
    },
    ...(taskRun.sessionId
      ? {
          session: {
            href: `/api/projects/${taskRun.projectId}/acp-sessions/${taskRun.sessionId}`,
          },
        }
      : {}),
    ...(taskRun.retryOfRunId
      ? {
          retry: {
            href: `/api/task-runs/${taskRun.retryOfRunId}`,
          },
        }
      : {}),
    ...(taskRun.isLatest && retryableTaskRunStatuses.has(taskRun.status)
      ? {
          'retry-action': {
            href: `/api/task-runs/${taskRun.id}/retry`,
          },
        }
      : {}),
  };
}

function presentTaskRunResource(taskRun: TaskRunPayload) {
  return {
    _links: createTaskRunLinks(taskRun),
    ...taskRun,
  };
}

export function presentTaskRun(taskRun: TaskRunPayload) {
  return presentTaskRunResource(taskRun);
}

export function presentTaskRunList(payload: TaskRunListPayload) {
  const searchParams = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  if (payload.status) {
    searchParams.set('status', payload.status);
  }

  if (payload.sessionId) {
    searchParams.set('sessionId', payload.sessionId);
  }

  const selfHref = payload.taskId
    ? `/api/tasks/${payload.taskId}/runs?${searchParams.toString()}`
    : `/api/projects/${payload.projectId}/task-runs?${searchParams.toString()}`;

  return {
    _links: {
      self: {
        href: selfHref,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      taskRuns: payload.items.map(presentTaskRunResource),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    status: payload.status,
    taskId: payload.taskId,
    total: payload.total,
  };
}
