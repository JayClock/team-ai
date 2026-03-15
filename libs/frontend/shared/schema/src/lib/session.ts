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
  | 'tool_call'
  | 'tool_call_update'
  | 'agent_message'
  | 'agent_thought'
  | 'user_message'
  | 'plan_update'
  | 'turn_complete'
  | 'session_info_update'
  | 'current_mode_update'
  | 'config_option_update'
  | 'usage_update'
  | 'available_commands_update'
  | 'error';

export type AcpToolCall = {
  content: unknown[];
  input?: unknown;
  inputFinalized: boolean;
  kind?: string | null;
  locations: unknown[];
  output?: unknown;
  status: 'completed' | 'failed' | 'pending' | 'running';
  title?: string | null;
  toolCallId?: string;
};

export type AcpCanonicalUpdate = {
  availableCommands?: unknown[];
  configOptions?: unknown;
  error?: {
    code: string;
    message: string;
  };
  eventType: AcpEventType;
  message?: {
    content: string | null;
    contentBlock?: unknown;
    isChunk: boolean;
    messageId?: string | null;
    role: 'assistant' | 'thought' | 'user';
  };
  mode?: {
    currentModeId?: string;
  };
  planItems?: Array<{
    description: string;
    priority?: 'high' | 'low' | 'medium';
    status?: 'completed' | 'in_progress' | 'pending';
  }>;
  provider: string;
  rawNotification: unknown;
  sessionId: string;
  sessionInfo?: {
    title?: string | null;
    updatedAt?: string | null;
  };
  timestamp: string;
  toolCall?: AcpToolCall;
  traceId?: string;
  turnComplete?: {
    state?: 'FAILED' | 'CANCELLED';
    stopReason: string;
    usage: unknown;
    userMessageId: string | null;
  };
  usage?: {
    cost: unknown;
    size: number;
    used: number;
  };
};

export type AcpEventEnvelope = {
  eventId: string;
  sessionId: string;
  emittedAt: string;
  error?: AcpEventError | null;
  update: AcpCanonicalUpdate;
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
