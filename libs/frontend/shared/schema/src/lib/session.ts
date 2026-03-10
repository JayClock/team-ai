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

export type AcpSession = Entity<
  AcpSessionData,
  {
    self: AcpSession;
    history: AcpSessionHistory;
    collection: AcpSessionCollection;
  }
>;
