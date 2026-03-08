import { customAlphabet } from 'nanoid';
import { ProblemError } from '../errors/problem-error';
import type {
  OrchestrationEventPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
  SessionStatus,
  StepStatus,
} from '../schemas/orchestration';

const sessionIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const stepIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);
const eventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

const sessions = new Map<string, OrchestrationSessionPayload>();
const stepsBySession = new Map<string, OrchestrationStepPayload[]>();
const eventsBySession = new Map<string, OrchestrationEventPayload[]>();
const sessionByStep = new Map<string, string>();

function createSessionId() {
  return `orc_${sessionIdGenerator()}`;
}

function createStepId() {
  return `step_${stepIdGenerator()}`;
}

function createEventId() {
  return `evt_${eventIdGenerator()}`;
}

function throwSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/orchestration-session-not-found',
    title: 'Orchestration Session Not Found',
    status: 404,
    detail: `Orchestration session ${sessionId} was not found`,
  });
}

function throwStepNotFound(stepId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/orchestration-step-not-found',
    title: 'Orchestration Step Not Found',
    status: 404,
    detail: `Orchestration step ${stepId} was not found`,
  });
}

function appendEvent(
  sessionId: string,
  type: OrchestrationEventPayload['type'],
  payload: Record<string, unknown>,
  stepId?: string,
) {
  const event: OrchestrationEventPayload = {
    id: createEventId(),
    at: new Date().toISOString(),
    sessionId,
    stepId,
    type,
    payload,
  };

  const events = eventsBySession.get(sessionId) ?? [];
  events.push(event);
  eventsBySession.set(sessionId, events);

  return event;
}

function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
): OrchestrationSessionPayload {
  const session = sessions.get(sessionId);

  if (!session) {
    throwSessionNotFound(sessionId);
  }

  const next = {
    ...session,
    status,
    updatedAt: new Date().toISOString(),
  };

  sessions.set(sessionId, next);

  return next;
}

function updateStepStatus(
  stepId: string,
  status: StepStatus,
): OrchestrationStepPayload {
  const sessionId = sessionByStep.get(stepId);

  if (!sessionId) {
    throwStepNotFound(stepId);
  }

  const steps = stepsBySession.get(sessionId) ?? [];
  const index = steps.findIndex((step) => step.id === stepId);

  if (index < 0) {
    throwStepNotFound(stepId);
  }

  const next = {
    ...steps[index],
    status,
    attempt:
      status === 'READY' && steps[index].status === 'FAILED'
        ? steps[index].attempt + 1
        : steps[index].attempt,
    updatedAt: new Date().toISOString(),
  };

  steps[index] = next;
  stepsBySession.set(sessionId, steps);

  return next;
}

export async function createOrchestrationSession(input: {
  goal: string;
  projectId: string;
  title: string;
}) {
  const now = new Date().toISOString();
  const sessionId = createSessionId();
  const session: OrchestrationSessionPayload = {
    id: sessionId,
    projectId: input.projectId,
    title: input.title,
    goal: input.goal,
    status: 'PENDING',
    strategy: {
      mode: 'planner-assisted',
      failFast: true,
      maxParallelism: 1,
    },
    stepCounts: {
      total: 3,
      completed: 0,
      failed: 0,
      running: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  const steps: OrchestrationStepPayload[] = [
    {
      id: createStepId(),
      sessionId,
      title: 'Analyze request',
      kind: 'PLAN',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 3,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createStepId(),
      sessionId,
      title: 'Implement local changes',
      kind: 'IMPLEMENT',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 3,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createStepId(),
      sessionId,
      title: 'Verify result',
      kind: 'VERIFY',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 3,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  sessions.set(sessionId, session);
  stepsBySession.set(sessionId, steps);

  for (const step of steps) {
    sessionByStep.set(step.id, sessionId);
  }

  const event = appendEvent(sessionId, 'session.created', {
    projectId: input.projectId,
    title: input.title,
  });

  return {
    event,
    session,
  };
}

export async function listOrchestrationSessions(query: {
  page: number;
  pageSize: number;
  projectId?: string;
  status?: SessionStatus;
}) {
  let items = Array.from(sessions.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  if (query.projectId) {
    items = items.filter((item) => item.projectId === query.projectId);
  }

  if (query.status) {
    items = items.filter((item) => item.status === query.status);
  }

  const start = (query.page - 1) * query.pageSize;
  const pagedItems = items.slice(start, start + query.pageSize);

  return {
    items: pagedItems,
    page: query.page,
    pageSize: query.pageSize,
    total: items.length,
  };
}

export async function getOrchestrationSessionById(sessionId: string) {
  const session = sessions.get(sessionId);

  if (!session) {
    throwSessionNotFound(sessionId);
  }

  return session;
}

export async function listOrchestrationSteps(sessionId: string) {
  await getOrchestrationSessionById(sessionId);
  return stepsBySession.get(sessionId) ?? [];
}

export async function getOrchestrationStepById(stepId: string) {
  const sessionId = sessionByStep.get(stepId);

  if (!sessionId) {
    throwStepNotFound(stepId);
  }

  const step = (stepsBySession.get(sessionId) ?? []).find(
    (candidate) => candidate.id === stepId,
  );

  if (!step) {
    throwStepNotFound(stepId);
  }

  return step;
}

export async function listOrchestrationEvents(sessionId: string) {
  await getOrchestrationSessionById(sessionId);
  return eventsBySession.get(sessionId) ?? [];
}

export async function listStepEvents(stepId: string) {
  const step = await getOrchestrationStepById(stepId);
  const events = eventsBySession.get(step.sessionId) ?? [];

  return {
    events: events.filter((event) => event.stepId === stepId),
    sessionId: step.sessionId,
  };
}

export async function cancelOrchestrationSession(sessionId: string) {
  const session = updateSessionStatus(sessionId, 'CANCELLED');
  const event = appendEvent(sessionId, 'session.cancelled', {});

  return {
    event,
    session,
  };
}

export async function resumeOrchestrationSession(sessionId: string) {
  const session = updateSessionStatus(sessionId, 'RUNNING');
  const event = appendEvent(sessionId, 'session.resumed', {});

  return {
    event,
    session,
  };
}

export async function retryOrchestrationSession(sessionId: string) {
  const session = updateSessionStatus(sessionId, 'RUNNING');
  const event = appendEvent(sessionId, 'session.retried', {});

  return {
    event,
    session,
  };
}

export async function retryOrchestrationStep(stepId: string) {
  const step = updateStepStatus(stepId, 'READY');
  const event = appendEvent(step.sessionId, 'step.retried', {}, step.id);

  return {
    event,
    step,
  };
}
