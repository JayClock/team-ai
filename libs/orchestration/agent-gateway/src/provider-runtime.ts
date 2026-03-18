import type { GatewayEventError } from './session-store.js';
import type { GatewayConfig } from './config.js';
import { createProviderAdapter } from './providers/provider-adapter-registry.js';
import {
  normalizeProviderId,
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
    for (const providerName of config.providers) {
      const canonicalProviderName = normalizeProviderId(providerName);
      if (this.adapters.has(canonicalProviderName)) {
        continue;
      }
      const adapter = this.createAdapter(canonicalProviderName);
      if (adapter) {
        this.adapters.set(canonicalProviderName, adapter);
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
    const canonicalProviderName = normalizeProviderId(providerName);
    const cached = this.adapters.get(canonicalProviderName);
    if (cached) {
      return cached;
    }

    const adapter = this.createAdapter(canonicalProviderName);
    if (!adapter) {
      return null;
    }

    this.adapters.set(canonicalProviderName, adapter);
    return adapter;
  }

  private createAdapter(providerName: string): ProviderAdapter | null {
    const canonicalProviderName = normalizeProviderId(providerName);

    const preset = resolveAcpCliProviderPreset(canonicalProviderName);
    if (!preset) {
      return null;
    }

    return createProviderAdapter({
      preset,
      launchCommand: resolveAcpCliCommand(preset),
      timeouts: this.config.timeouts,
    });
  }
}
