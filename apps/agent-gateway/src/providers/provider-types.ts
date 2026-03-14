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

  prompt(
    request: ProviderPromptRequest,
    callbacks: ProviderPromptCallbacks,
  ): void;

  cancel(sessionId: string): boolean;

  close?(): Promise<void>;
}
