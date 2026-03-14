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

export type ProviderProtocolEvent = {
  protocol: ProtocolName;
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
