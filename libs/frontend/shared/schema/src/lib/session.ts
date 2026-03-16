import { Collection, Entity } from '@hateoas-ts/resource';
import type { Codebase } from './codebase.js';
import type { NoteCollection } from './note.js';
import type { Project } from './project.js';
import type { Worktree } from './worktree.js';

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
  codebase: AcpRef | null;
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
  worktree: AcpRef | null;
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
  | 'terminal_created'
  | 'terminal_output'
  | 'terminal_exited'
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

export type AcpTerminal = {
  terminalId: string;
  command?: string | null;
  args?: string[];
  data?: string | null;
  interactive?: boolean;
  exitCode?: number | null;
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
  terminal?: AcpTerminal;
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
    codebase?: Codebase;
    notes: NoteCollection;
    project?: Project;
    worktree?: Worktree;
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
    codebase?: Codebase;
    project?: Project;
    worktree?: Worktree;
  }
>;
