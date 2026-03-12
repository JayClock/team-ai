import type { GatewayEventError } from './session-store.js';
import type { GatewayConfig } from './config.js';
import { AcpCliProviderAdapter } from './providers/acp-cli-provider.js';
import { CodexProviderAdapter } from './providers/codex-provider.js';
import {
  resolveAcpCliCommand,
  resolveAcpCliProviderPreset,
} from './providers/provider-presets.js';
import type {
  ProviderAdapter,
  ProviderPromptRequest,
  ProviderProtocolEvent,
} from './providers/provider-types.js';

export class ProviderRuntime {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor(private readonly config: GatewayConfig) {
    this.adapters.set('codex', new CodexProviderAdapter(config.codexCommand));

    for (const providerName of config.providers) {
      if (this.adapters.has(providerName)) {
        continue;
      }
      const adapter = this.createAdapter(providerName);
      if (adapter) {
        this.adapters.set(providerName, adapter);
      }
    }
  }

  prompt(
    providerName: string,
    request: ProviderPromptRequest,
    callbacks: {
      onChunk: (chunk: string) => void;
      onEvent: (event: ProviderProtocolEvent) => void;
      onComplete: () => void;
      onError: (error: GatewayEventError) => void;
    },
  ): void {
    const adapter = this.getAdapter(providerName);
    if (!adapter) {
      callbacks.onError({
        code: 'PROVIDER_NOT_SUPPORTED',
        message: `Provider is not supported: ${providerName}`,
        retryable: false,
        retryAfterMs: 0,
      });
      return;
    }

    adapter.prompt(request, {
      onChunk: callbacks.onChunk,
      onEvent: callbacks.onEvent,
      onComplete: callbacks.onComplete,
      onError: callbacks.onError,
    });
  }

  cancel(providerName: string, sessionId: string): boolean {
    const adapter = this.getAdapter(providerName);
    if (!adapter) {
      return false;
    }
    return adapter.cancel(sessionId);
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        await adapter.close?.();
      }),
    );
  }

  private getAdapter(providerName: string): ProviderAdapter | null {
    const cached = this.adapters.get(providerName);
    if (cached) {
      return cached;
    }

    const adapter = this.createAdapter(providerName);
    if (!adapter) {
      return null;
    }

    this.adapters.set(providerName, adapter);
    return adapter;
  }

  private createAdapter(providerName: string): ProviderAdapter | null {
    if (providerName === 'codex') {
      return new CodexProviderAdapter(this.config.codexCommand);
    }

    const preset = resolveAcpCliProviderPreset(providerName);
    if (!preset) {
      return null;
    }

    return new AcpCliProviderAdapter(preset, resolveAcpCliCommand(preset));
  }
}
