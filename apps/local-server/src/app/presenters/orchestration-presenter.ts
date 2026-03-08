import type {
  OrchestrationEventPayload,
  OrchestrationSessionListPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
} from '../schemas/orchestration';

function createSessionLinks(session: OrchestrationSessionPayload) {
  return {
    self: {
      href: `/api/orchestration/sessions/${session.id}`,
    },
    project: {
      href: `/api/projects/${session.projectId}`,
    },
    steps: {
      href: `/api/orchestration/sessions/${session.id}/steps`,
    },
    events: {
      href: `/api/orchestration/sessions/${session.id}/events`,
    },
    stream: {
      href: `/api/orchestration/sessions/${session.id}/stream`,
    },
    cancel: {
      href: `/api/orchestration/sessions/${session.id}/cancel`,
    },
    resume: {
      href: `/api/orchestration/sessions/${session.id}/resume`,
    },
    retry: {
      href: `/api/orchestration/sessions/${session.id}/retry`,
    },
  };
}

function createStepLinks(step: OrchestrationStepPayload) {
  return {
    self: {
      href: `/api/orchestration/steps/${step.id}`,
    },
    session: {
      href: `/api/orchestration/sessions/${step.sessionId}`,
    },
    events: {
      href: `/api/orchestration/steps/${step.id}/events`,
    },
    retry: {
      href: `/api/orchestration/steps/${step.id}/retry`,
    },
  };
}

export function presentOrchestrationRoot() {
  return {
    _links: {
      self: {
        href: '/api/orchestration',
      },
      sessions: {
        href: '/api/orchestration/sessions{?projectId,status,page,pageSize}',
        templated: true,
      },
      'create-session': {
        href: '/api/orchestration/sessions',
      },
    },
    capabilities: {
      cancel: true,
      resume: true,
      retry: true,
      streaming: true,
    },
    name: 'local-orchestration',
  };
}

export function presentOrchestrationSession(
  session: OrchestrationSessionPayload,
) {
  return {
    _links: createSessionLinks(session),
    ...session,
  };
}

export function presentOrchestrationSessionList(
  payload: OrchestrationSessionListPayload,
) {
  const query = new URLSearchParams({
    page: String(payload.page),
    pageSize: String(payload.pageSize),
  });

  return {
    _links: {
      self: {
        href: `/api/orchestration/sessions?${query.toString()}`,
      },
      root: {
        href: '/api/orchestration',
      },
    },
    _embedded: {
      sessions: payload.items.map((session) => ({
        _links: createSessionLinks(session),
        ...session,
      })),
    },
    page: payload.page,
    pageSize: payload.pageSize,
    total: payload.total,
  };
}

export function presentOrchestrationSteps(steps: OrchestrationStepPayload[]) {
  return {
    _embedded: {
      steps: steps.map((step) => ({
        _links: createStepLinks(step),
        ...step,
      })),
    },
  };
}

export function presentOrchestrationStep(step: OrchestrationStepPayload) {
  return {
    _links: createStepLinks(step),
    ...step,
  };
}

export function presentOrchestrationEvents(
  sessionId: string,
  events: OrchestrationEventPayload[],
) {
  return {
    _links: {
      self: {
        href: `/api/orchestration/sessions/${sessionId}/events`,
      },
      session: {
        href: `/api/orchestration/sessions/${sessionId}`,
      },
    },
    _embedded: {
      events,
    },
  };
}

export function presentStepEvents(
  stepId: string,
  sessionId: string,
  events: OrchestrationEventPayload[],
) {
  return {
    _links: {
      self: {
        href: `/api/orchestration/steps/${stepId}/events`,
      },
      session: {
        href: `/api/orchestration/sessions/${sessionId}`,
      },
    },
    _embedded: {
      events,
    },
  };
}
