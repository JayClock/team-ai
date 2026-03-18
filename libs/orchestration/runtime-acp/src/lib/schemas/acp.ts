export type AcpSessionState =
  | 'PENDING'
  | 'RUNNING'
  | 'CANCELLING'
  | 'FAILED'
  | 'CANCELLED';

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
  | 'lifecycle_update'
  | 'supervision_update'
  | 'error';

export type AcpTimeoutScopePayload =
  | 'prompt'
  | 'session_total'
  | 'session_inactive'
  | 'step_budget'
  | 'provider_initialize'
  | 'provider_request'
  | 'gateway_completion_wait'
  | 'tool_execution'
  | 'mcp_execution'
  | 'force_kill_grace';

export interface AcpSupervisionPolicyPayload {
  cancelGraceMs: number;
  completionGraceMs: number;
  inactivityTimeoutMs: number;
  maxRetries: number;
  maxSteps: number | null;
  packageManagerInitTimeoutMs: number;
  promptTimeoutMs: number;
  providerInitTimeoutMs: number;
  totalTimeoutMs: number;
}

export type AcpLifecycleStatePayload =
  | 'idle'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelling'
  | 'cancelled'
  | 'timed_out_prompt'
  | 'timed_out_inactive'
  | 'timed_out_total'
  | 'timed_out_step_budget'
  | 'timed_out_provider_initialize'
  | 'force_killed';

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
  supervision?: {
    detail?: string | null;
    forceKilled?: boolean;
    policy?: AcpSupervisionPolicyPayload;
    scope?: AcpTimeoutScopePayload;
    stage:
      | 'policy_resolved'
      | 'timeout_detected'
      | 'cancel_requested'
      | 'cancel_grace_expired'
      | 'force_killed';
  };
  terminal?: AcpEventTerminalPayload;
  timestamp: string;
  lifecycle?: {
    detail?: string | null;
    state: AcpLifecycleStatePayload;
    taskBound?: boolean;
  };
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
  state: AcpSessionState;
  supervisionPolicy: AcpSupervisionPolicyPayload;
  deadlineAt: string | null;
  inactiveDeadlineAt: string | null;
  cancelRequestedAt: string | null;
  cancelledAt: string | null;
  forceKilledAt: string | null;
  timeoutScope: AcpTimeoutScopePayload | null;
  stepCount: number;
  task: AcpRefPayload | null;
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

export interface AcpRuntimeSessionPayload {
  cwd: string;
  isBusy: boolean;
  lastTouchedAt: string;
  localSessionId: string;
  provider: string;
  runtimeSessionId: string;
  session: AcpSessionPayload | null;
  streamSubscriberCount: number;
}

export interface AcpRuntimeSessionListPayload {
  items: AcpRuntimeSessionPayload[];
  total: number;
}
