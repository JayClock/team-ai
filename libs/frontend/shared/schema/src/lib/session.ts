import { Collection, Entity } from '@hateoas-ts/resource';

export type AcpRef = {
  id: string;
};

export type AcpSessionState =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AcpSessionData = {
  id: string;
  project: AcpRef;
  actor: AcpRef;
  parentSession: AcpRef | null;
  name: string | null;
  provider: string;
  mode: string;
  state: AcpSessionState;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  lastEventId: AcpRef | null;
};

export type AcpEventError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
};

export type AcpEventType =
  | 'status'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'complete'
  | 'error';

export type AcpBaseEventData = {
  protocol?: string;
  payload?: Record<string, unknown>;
};

export type AcpStatusEventData = AcpBaseEventData & {
  prompt?: string;
  reason?: string;
  source?: string;
  state?: string;
};

export type AcpMessageEventData = AcpBaseEventData & {
  content: string | null;
};

export type AcpToolCallEventData = AcpBaseEventData & {
  input?: unknown;
  toolName: string | null;
};

export type AcpToolResultEventData = AcpBaseEventData & {
  output?: unknown;
  toolName: string | null;
};

export type AcpCompleteEventData = AcpBaseEventData & {
  reason?: string | null;
  state?: string;
};

export type AcpErrorEventData = AcpBaseEventData & {
  message?: string | null;
  state?: string;
};

export type AcpEventEnvelopeBase = {
  eventId: string;
  sessionId: string;
  emittedAt: string;
  error?: AcpEventError | null;
};

export type AcpEventEnvelope =
  | (AcpEventEnvelopeBase & {
      type: 'status';
      data: AcpStatusEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'message';
      data: AcpMessageEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'tool_call';
      data: AcpToolCallEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'tool_result';
      data: AcpToolResultEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'complete';
      data: AcpCompleteEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'error';
      data: AcpErrorEventData;
    });

export type AcpSessionHistory = Entity<{
  projectId: string;
  sessionId: string;
  history: AcpEventEnvelope[];
}>;

export type AcpSessionSummary = Entity<
  AcpSessionData,
  {
    self: AcpSession;
  }
>;

export type AcpSessionCollection = Entity<
  Collection<AcpSessionSummary>['data'],
  Collection<AcpSessionSummary>['links']
>;

export type OrchestrationSessionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'RUNNING'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrchestrationStepStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_RETRY'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrchestrationStepKind = 'PLAN' | 'IMPLEMENT' | 'VERIFY';

export type OrchestrationSessionData = {
  createdAt: string;
  currentPhase?: OrchestrationStepKind | null;
  executionMode: string;
  goal: string;
  id: string;
  lastEventAt?: string | null;
  provider: string;
  projectId: string;
  status: OrchestrationSessionStatus;
  strategy: {
    failFast: boolean;
    maxParallelism: number;
    mode: string;
  };
  stepCounts: {
    completed: number;
    failed: number;
    running: number;
    total: number;
  };
  title: string;
  traceId?: string;
  updatedAt: string;
  workspaceRoot?: string | null;
};

export type OrchestrationEventType =
  | 'session.created'
  | 'session.running'
  | 'session.cancelled'
  | 'session.completed'
  | 'session.failed'
  | 'session.resumed'
  | 'session.retried'
  | 'step.ready'
  | 'step.started'
  | 'step.runtime.event'
  | 'step.cancelled'
  | 'step.completed'
  | 'step.failed'
  | 'step.retried';

export type OrchestrationEvent = {
  at: string;
  id: string;
  payload: Record<string, unknown>;
  sessionId: string;
  stepId?: string;
  type: OrchestrationEventType;
};

export type OrchestrationEvents = Entity<
  {
    events: OrchestrationEvent[];
  },
  {
    self: OrchestrationEvents;
    session: OrchestrationSession;
  }
>;

export type OrchestrationSessionSummary = Entity<
  OrchestrationSessionData,
  {
    self: OrchestrationSession;
    project: Entity;
    collection: OrchestrationSessionCollection;
    steps: Entity;
    events: OrchestrationEvents;
    stream: Entity;
    cancel: Entity;
    resume: Entity;
    retry: Entity;
  }
>;

export type OrchestrationSessionCollection = Entity<
  Collection<OrchestrationSessionSummary>['data'],
  Collection<OrchestrationSessionSummary>['links']
>;

export type AcpSession = Entity<
  AcpSessionData,
  {
    self: AcpSession;
    history: AcpSessionHistory;
    collection: AcpSessionCollection;
  }
>;

export type OrchestrationSession = Entity<
  OrchestrationSessionData,
  {
    self: OrchestrationSession;
    project: Entity;
    collection: OrchestrationSessionCollection;
    steps: Entity;
    events: OrchestrationEvents;
    stream: Entity;
    cancel: Entity;
    resume: Entity;
    retry: Entity;
  }
>;
