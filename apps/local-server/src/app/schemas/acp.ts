export type AcpSessionState = 'PENDING' | 'RUNNING' | 'FAILED' | 'CANCELLED';

export type AcpSessionStatus = 'connecting' | 'ready' | 'error';

export interface AcpRefPayload {
  id: string;
}

export interface AcpEventErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
}

export type AcpEventTypePayload =
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
  | 'orchestration_update'
  | 'error';

export type AcpOrchestrationEventName =
  | 'child_session_completed'
  | 'delegation_group_completed'
  | 'gate_required'
  | 'parent_session_resume_requested';

export interface AcpEventToolCallPayload {
  content: unknown[];
  input?: unknown;
  inputFinalized: boolean;
  kind?: string | null;
  locations: unknown[];
  output?: unknown;
  status: 'completed' | 'failed' | 'pending' | 'running';
  title?: string | null;
  toolCallId?: string;
}

export interface AcpEventTerminalPayload {
  args?: string[];
  command?: string | null;
  data?: string | null;
  exitCode?: number | null;
  interactive?: boolean;
  terminalId: string;
}

export interface AcpEventUpdatePayload {
  availableCommands?: unknown[];
  configOptions?: unknown;
  error?: {
    code: string;
    message: string;
  };
  eventType: AcpEventTypePayload;
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
  orchestration?: {
    childSessionId?: string | null;
    delegationGroupId?: string | null;
    eventName: AcpOrchestrationEventName;
    parentSessionId?: string | null;
    taskId?: string | null;
    taskIds?: string[];
    wakeDelivered?: boolean;
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
  terminal?: AcpEventTerminalPayload;
  timestamp: string;
  toolCall?: AcpEventToolCallPayload;
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
}

export interface AcpEventEnvelopePayload {
  emittedAt: string;
  error: AcpEventErrorPayload | null;
  eventId: string;
  sessionId: string;
  update: AcpEventUpdatePayload;
}

export interface AcpSessionPayload {
  acpError: string | null;
  acpStatus: AcpSessionStatus;
  agent: AcpRefPayload | null;
  actor: AcpRefPayload;
  codebase: AcpRefPayload | null;
  completedAt: string | null;
  cwd: string;
  failureReason: string | null;
  id: string;
  lastActivityAt: string | null;
  lastEventId: AcpRefPayload | null;
  model: string | null;
  name: string | null;
  parentSession: AcpRefPayload | null;
  project: AcpRefPayload;
  provider: string;
  specialistId: string | null;
  startedAt: string | null;
  worktree: AcpRefPayload | null;
}

export interface AcpSessionListPayload {
  items: AcpSessionPayload[];
  page: number;
  pageSize: number;
  projectId: string;
  total: number;
}
