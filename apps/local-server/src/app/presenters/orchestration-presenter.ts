import type {
  OrchestrationEventPayload,
  OrchestrationSessionListPayload,
  OrchestrationSessionPayload,
  SessionStatus,
  OrchestrationStepPayload,
} from '../schemas/orchestration';

function createSessionLinks(session: OrchestrationSessionPayload) {
  return {
    self: {
      href: `/api/sessions/${session.id}`,
    },
    project: {
      href: `/api/projects/${session.projectId}`,
    },
    collection: {
      href: `/api/projects/${session.projectId}/sessions`,
    },
    steps: {
      href: `/api/sessions/${session.id}/steps`,
    },
    events: {
      href: `/api/sessions/${session.id}/events`,
    },
    stream: {
      href: `/api/sessions/${session.id}/stream`,
    },
    cancel: {
      href: `/api/sessions/${session.id}/cancel`,
    },
    resume: {
      href: `/api/sessions/${session.id}/resume`,
    },
    retry: {
      href: `/api/sessions/${session.id}/retry`,
    },
  };
}

function createStepLinks(step: OrchestrationStepPayload) {
  return {
    self: {
      href: `/api/steps/${step.id}`,
    },
    session: {
      href: `/api/sessions/${step.sessionId}`,
    },
    events: {
      href: `/api/steps/${step.id}/events`,
    },
    retry: {
      href: `/api/steps/${step.id}/retry`,
    },
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
  requestQuery?: {
    page?: number;
    pageSize?: number;
    projectId?: string;
    status?: SessionStatus;
  },
) {
  const searchParams = new URLSearchParams({
    page: String(requestQuery?.page ?? payload.page),
    pageSize: String(requestQuery?.pageSize ?? payload.pageSize),
  });

  if (requestQuery?.status) {
    searchParams.set('status', requestQuery.status);
  }

  const selfHref = requestQuery?.projectId
    ? `/api/projects/${requestQuery.projectId}/sessions?${searchParams.toString()}`
    : `/api/sessions?${searchParams.toString()}`;

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
        href: `/api/sessions/${sessionId}/events`,
      },
      session: {
        href: `/api/sessions/${sessionId}`,
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
        href: `/api/steps/${stepId}/events`,
      },
      session: {
        href: `/api/sessions/${sessionId}`,
      },
    },
    _embedded: {
      events,
    },
  };
}
