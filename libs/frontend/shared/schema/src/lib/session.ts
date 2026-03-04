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

export type AcpEventEnvelope = {
  eventId: string;
  sessionId: string;
  type: string;
  emittedAt: string;
  data: Record<string, unknown>;
  error?: AcpEventError | null;
};

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
