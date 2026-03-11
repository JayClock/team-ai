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
  cwd: string;
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
  | 'plan'
  | 'session'
  | 'mode'
  | 'config'
  | 'usage'
  | 'complete'
  | 'error';

export type AcpBaseEventData = {
  protocol?: string;
  payload?: Record<string, unknown>;
  source?: string;
};

export type AcpStatusEventData = AcpBaseEventData & {
  availableCommands?: unknown[];
  prompt?: string;
  reason?: string;
  state?: string;
};

export type AcpMessageEventData = AcpBaseEventData & {
  content: string | null;
  contentBlock?: unknown;
  kind?: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk';
  messageId?: string | null;
  role?: 'user' | 'assistant' | 'thought';
};

export type AcpToolCallEventData = AcpBaseEventData & {
  content?: unknown[];
  input?: unknown;
  kind?: string | null;
  locations?: Array<{ line?: number | null; path: string }>;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | null;
  title?: string | null;
  toolName: string | null;
  toolCallId?: string;
};

export type AcpToolResultEventData = AcpBaseEventData & {
  content?: unknown[];
  kind?: string | null;
  locations?: Array<{ line?: number | null; path: string }>;
  output?: unknown;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | null;
  title?: string | null;
  toolName: string | null;
  toolCallId?: string;
};

export type AcpCompleteEventData = AcpBaseEventData & {
  reason?: string | null;
  state?: string;
  stopReason?: string | null;
  usage?: unknown;
  userMessageId?: string | null;
};

export type AcpErrorEventData = AcpBaseEventData & {
  message?: string | null;
  state?: string;
};

export type AcpPlanEventData = AcpBaseEventData & {
  entries: Array<{
    content: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed';
  }>;
};

export type AcpSessionEventData = AcpBaseEventData & {
  cwd?: string;
  mode?: string;
  provider?: string;
  reason?: string;
  state?: string;
  title?: string | null;
  updatedAt?: string | null;
};

export type AcpModeEventData = AcpBaseEventData & {
  currentModeId: string;
};

export type AcpConfigEventData = AcpBaseEventData & {
  configOptions: unknown[];
};

export type AcpUsageEventData = AcpBaseEventData & {
  cost?: unknown;
  size: number;
  used: number;
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
      type: 'plan';
      data: AcpPlanEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'session';
      data: AcpSessionEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'mode';
      data: AcpModeEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'config';
      data: AcpConfigEventData;
    })
  | (AcpEventEnvelopeBase & {
      type: 'usage';
      data: AcpUsageEventData;
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
  cwd?: string | null;
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
