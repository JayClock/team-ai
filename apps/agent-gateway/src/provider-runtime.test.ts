import { describe, expect, it, vi } from 'vitest';

const acpPrompt = vi.fn(
  (
    _request: unknown,
    callbacks: {
      onComplete: () => void;
    },
  ) => {
    callbacks.onComplete();
  },
);

vi.mock('./providers/acp-cli-provider.js', () => ({
  AcpCliProviderAdapter: class {
    prompt = acpPrompt;
    cancel() {
      return false;
    }
    close() {
      return Promise.resolve();
    }
  },
}));

import { ProviderRuntime } from './provider-runtime.js';

describe('ProviderRuntime', () => {
  it('accepts codex-acp as a codex alias', () => {
    const runtime = new ProviderRuntime({
      host: '127.0.0.1',
      port: 3321,
      version: 'test',
      protocols: ['acp'],
      providers: ['codex'],
      defaultProvider: 'codex',
      timeoutMs: 30_000,
      retryAttempts: 2,
      maxConcurrentSessions: 32,
      logLevel: 'info',
    });

    const onComplete = vi.fn();
    const onError = vi.fn();

    runtime.prompt(
      'codex-acp',
      {
        sessionId: 'session-1',
        input: 'hello',
        timeoutMs: 1_000,
      },
      {
        onChunk: vi.fn(),
        onEvent: vi.fn(),
        onComplete,
        onError,
      },
    );

    expect(acpPrompt).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PROVIDER_NOT_SUPPORTED',
      }),
    );
  });
});
