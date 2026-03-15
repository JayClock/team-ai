import type { ProtocolName } from '../session-store.js';

export const PROVIDER_ADAPTER_KINDS = {
  acpCli: 'acp-cli',
  codexAppServer: 'codex-app-server',
} as const;

export type ProviderAdapterKind = string;

export type ProviderLaunchCommand = {
  args: string[];
  command: string;
};

export type ProviderPromptRequest = {
  sessionId: string;
  input: string;
  timeoutMs: number;
  traceId?: string;
  cwd?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type ProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
};

export type NormalizedAcpEventType =
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

export interface NormalizedAcpToolCall {
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

export interface NormalizedAcpUpdate {
  eventType: NormalizedAcpEventType;
  provider: string;
  // Diagnostic-only provider payload. Downstream business semantics should
  // come from canonical fields on this update, not by reparsing this object.
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
  toolCall?: NormalizedAcpToolCall;
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

export type ProviderBehavior = {
  immediateToolInput: boolean;
  protocol: 'acp';
  streaming: boolean;
};

export function createNormalizedAcpUpdate(
  sessionId: string,
  provider: string,
  eventType: NormalizedAcpUpdate['eventType'],
  extras: Omit<
    Partial<NormalizedAcpUpdate>,
    'eventType' | 'provider' | 'sessionId' | 'timestamp'
  > = {},
): NormalizedAcpUpdate {
  return {
    sessionId,
    provider,
    eventType,
    timestamp: new Date().toISOString(),
    rawNotification: extras.rawNotification ?? null,
    ...extras,
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

export type ProviderProtocolEvent =
  | {
      protocol: 'acp';
      update: NormalizedAcpUpdate;
      traceId?: string;
    }
  | {
      protocol: Exclude<ProtocolName, 'acp'>;
      payload: unknown;
      traceId?: string;
    };

export type ProviderPromptCallbacks = {
  onChunk: (chunk: string) => void;
  onEvent: (event: ProviderProtocolEvent) => void;
  onComplete: () => void;
  onError: (error: ProviderError) => void;
};

export interface ProviderAdapter {
  readonly name: string;

  getBehavior(): ProviderBehavior;

  normalizeNotification(
    sessionId: string,
    traceId: string | undefined,
    notification: unknown,
  ): NormalizedAcpUpdate | null;

  prompt(
    request: ProviderPromptRequest,
    callbacks: ProviderPromptCallbacks,
  ): void;

  cancel(sessionId: string): boolean;

  close?(): Promise<void>;
}
