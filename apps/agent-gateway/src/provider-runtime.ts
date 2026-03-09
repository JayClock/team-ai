import type { GatewayEventError } from './session-store.js';
import { CodexProviderAdapter } from './providers/codex-provider.js';
import type { ProviderAdapter, ProviderPromptRequest } from './providers/provider-types.js';

export class ProviderRuntime {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor(codexCommand: string) {
    this.adapters.set('codex', new CodexProviderAdapter(codexCommand));
  }

  prompt(
    providerName: string,
    request: ProviderPromptRequest,
    callbacks: {
      onChunk: (chunk: string) => void;
      onComplete: () => void;
      onError: (error: GatewayEventError) => void;
    }
  ): void {
    const adapter = this.adapters.get(providerName);
    if (!adapter) {
      callbacks.onError({
        code: 'PROVIDER_NOT_SUPPORTED',
        message: `Provider is not supported: ${providerName}`,
        retryable: false,
        retryAfterMs: 0,
      });
      return;
    }

    adapter.prompt(
      request,
      {
        onChunk: callbacks.onChunk,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
      }
    );
  }

  cancel(providerName: string, sessionId: string): boolean {
    const adapter = this.adapters.get(providerName);
    if (!adapter) {
      return false;
    }
    return adapter.cancel(sessionId);
  }
}
