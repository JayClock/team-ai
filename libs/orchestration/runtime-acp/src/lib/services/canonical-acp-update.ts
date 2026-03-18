export type CanonicalAcpEventType =
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

export interface CanonicalAcpToolCall {
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

export interface CanonicalAcpTerminalEvent {
  args?: string[];
  command?: string | null;
  data?: string | null;
  exitCode?: number | null;
  interactive?: boolean;
  terminalId: string;
}

export interface CanonicalAcpUpdate {
  eventType: CanonicalAcpEventType;
  provider: string;
  rawNotification: unknown;
  sessionId: string;
  timestamp: string;
  traceId?: string;
  availableCommands?: unknown[];
  configOptions?: unknown;
  error?: {
    code: string;
    message: string;
  };
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
  sessionInfo?: {
    title?: string | null;
    updatedAt?: string | null;
  };
  terminal?: CanonicalAcpTerminalEvent;
  toolCall?: CanonicalAcpToolCall;
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

export function hasStructuredValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return value !== null && value !== undefined;
}

export function flattenAcpContentText(contentInput: unknown): string | null {
  if (typeof contentInput === 'string') {
    return contentInput;
  }

  if (!contentInput || typeof contentInput !== 'object') {
    return null;
  }

  const block = contentInput as {
    resource?: { text?: unknown };
    text?: unknown;
    type?: unknown;
    uri?: unknown;
  };

  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text;
  }

  if (block.type === 'resource_link' && typeof block.uri === 'string') {
    return block.uri;
  }

  if (
    block.type === 'resource' &&
    block.resource &&
    typeof block.resource === 'object' &&
    typeof block.resource.text === 'string'
  ) {
    return block.resource.text;
  }

  return null;
}
