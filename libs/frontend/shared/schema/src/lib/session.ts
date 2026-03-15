import { Collection, Entity } from '@hateoas-ts/resource';
import type { NoteCollection } from './note.js';

export type AcpRef = {
  id: string;
};

export type AcpSessionState =
  | 'PENDING'
  | 'RUNNING'
  | 'FAILED'
  | 'CANCELLED';

export type AcpSessionStatus =
  | 'connecting'
  | 'ready'
  | 'error';

export type AcpSessionData = {
  acpError: string | null;
  acpStatus: AcpSessionStatus;
  id: string;
  project: AcpRef;
  agent: AcpRef | null;
  actor: AcpRef;
  parentSession: AcpRef | null;
  name: string | null;
  provider: string;
  specialistId: string | null;
  cwd: string;
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
  output?: unknown;
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
    description: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed';
  }>;
};

export type AcpSessionEventData = AcpBaseEventData & {
  cwd?: string;
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
    notes: NoteCollection;
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
    notes: NoteCollection;
    collection: AcpSessionCollection;
  }
>;
