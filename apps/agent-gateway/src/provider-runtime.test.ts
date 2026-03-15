import { describe, expect, it, vi } from 'vitest';

const acpConstructed = vi.fn();

const acpPrompt = vi.fn(
  (_request: unknown,
    callbacks: {
      onComplete: () => void;
    },
  ) => {
    callbacks.onComplete();
  },
);

vi.mock('./providers/acp-cli-provider.js', () => ({
  AcpCliProviderAdapter: class {
    constructor() {
      acpConstructed();
    }

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
    acpConstructed.mockClear();
    acpPrompt.mockClear();

    const runtime = new ProviderRuntime({
      host: '127.0.0.1',
      port: 3321,
      version: 'test',
      protocols: ['acp'],
      providers: ['codex'],
      defaultProvider: 'codex',
      timeoutMs: 300_000,
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

    runtime.prompt(
      'codex',
      {
        sessionId: 'session-2',
        input: 'hello again',
        timeoutMs: 1_000,
      },
      {
        onChunk: vi.fn(),
        onEvent: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(acpConstructed).toHaveBeenCalledTimes(1);
    expect(acpPrompt).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PROVIDER_NOT_SUPPORTED',
      }),
    );
  });
});
