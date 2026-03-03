import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { GatewayConfig } from './config.js';
import { Logger } from './logger.js';
import { GatewayMetrics } from './observability.js';
import { createGatewayServer, type ProviderRuntimePort } from './server.js';
import { SessionStore } from './session-store.js';

class MockProviderRuntime implements ProviderRuntimePort {
  private readonly active = new Map<
    string,
    {
      onChunk: (chunk: string) => void;
      onComplete: () => void;
      onError: (error: { code: string; message: string; retryable: boolean; retryAfterMs: number }) => void;
    }
  >();

  prompt(
    _providerName: string,
    sessionId: string,
    input: string,
    _timeoutMs: number,
    _traceId: string | undefined,
    callbacks: {
      onChunk: (chunk: string) => void;
      onComplete: () => void;
      onError: (error: { code: string; message: string; retryable: boolean; retryAfterMs: number }) => void;
    }
  ): void {
    this.active.set(sessionId, callbacks);

    if (input.startsWith('slow')) {
      return;
    }

    queueMicrotask(() => {
      if (!this.active.has(sessionId)) {
        return;
      }
      if (input.startsWith('fail')) {
        callbacks.onError({
          code: 'PROVIDER_PROCESS_EXITED',
          message: 'mock provider failed',
          retryable: true,
          retryAfterMs: 500,
        });
        this.active.delete(sessionId);
        return;
      }

      callbacks.onChunk(`mock:${input}`);
      callbacks.onComplete();
      this.active.delete(sessionId);
    });
  }

  cancel(_providerName: string, sessionId: string): boolean {
    const callbacks = this.active.get(sessionId);
    if (!callbacks) {
      return false;
    }
    callbacks.onError({
      code: 'PROVIDER_CANCELLED',
      message: 'cancelled by test',
      retryable: false,
      retryAfterMs: 0,
    });
    this.active.delete(sessionId);
    return true;
  }
}

describe('gateway contract', () => {
  it('covers session/new + prompt + history + metrics', async () => {
    const runtime = new MockProviderRuntime();
    const gateway = await startGateway(runtime);
    try {
      const createResponse = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': 'trace-contract-1',
        },
        body: JSON.stringify({ provider: 'codex' }),
      });
      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get('x-trace-id')).toBe('trace-contract-1');
      const created = (await createResponse.json()) as { session: { sessionId: string } };
      const sessionId = created.session.sessionId;

      const promptResponse = await fetch(`${gateway.baseUrl}/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': 'trace-contract-1',
        },
        body: JSON.stringify({ input: 'hello-contract', timeoutMs: 2000 }),
      });
      expect(promptResponse.status).toBe(202);
      await sleep(30);

      const eventsResponse = await fetch(`${gateway.baseUrl}/sessions/${sessionId}/events`);
      expect(eventsResponse.status).toBe(200);
      const eventsPage = (await eventsResponse.json()) as {
        events: Array<{ cursor: string; type: string; traceId: string; error?: { code: string } }>;
      };
      expect(eventsPage.events.length).toBeGreaterThanOrEqual(3);
      expect(eventsPage.events[0]?.type).toBe('status');
      expect(eventsPage.events[1]?.type).toBe('status');
      expect(eventsPage.events[2]?.type).toBe('delta');
      expect(eventsPage.events.at(-1)?.type).toBe('complete');
      expect(eventsPage.events[0]?.traceId).toBe('trace-contract-1');

      const cursor = eventsPage.events[1]?.cursor;
      const replayResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/events?cursor=${encodeURIComponent(cursor)}`
      );
      const replayPage = (await replayResponse.json()) as { events: Array<{ cursor: string }> };
      expect(replayPage.events.length).toBeGreaterThanOrEqual(1);
      expect(replayPage.events[0]?.cursor).not.toBe(cursor);

      const metricsResponse = await fetch(`${gateway.baseUrl}/metrics`);
      expect(metricsResponse.status).toBe(200);
      const metrics = (await metricsResponse.json()) as {
        sessions: { createAttempts: number; createSuccessRate: number };
        prompts: { attempts: number; completionRate: number; firstTokenLatencyMs: { count: number } };
      };
      expect(metrics.sessions.createAttempts).toBe(1);
      expect(metrics.sessions.createSuccessRate).toBe(1);
      expect(metrics.prompts.attempts).toBe(1);
      expect(metrics.prompts.completionRate).toBe(1);
      expect(metrics.prompts.firstTokenLatencyMs.count).toBe(1);
    } finally {
      await gateway.close();
    }
  });

  it('covers cancel + stream + provider error distribution', async () => {
    const runtime = new MockProviderRuntime();
    const gateway = await startGateway(runtime);
    try {
      const createResponse = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'codex' }),
      });
      const created = (await createResponse.json()) as { session: { sessionId: string } };
      const sessionId = created.session.sessionId;

      const streamController = new AbortController();
      const streamPromise = fetch(`${gateway.baseUrl}/sessions/${sessionId}/stream`, {
        method: 'GET',
        signal: streamController.signal,
      });

      const promptResponse = await fetch(`${gateway.baseUrl}/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'slow-contract', timeoutMs: 5000 }),
      });
      expect(promptResponse.status).toBe(202);

      const cancelResponse = await fetch(`${gateway.baseUrl}/sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'cancel by contract test' }),
      });
      expect(cancelResponse.status).toBe(202);

      const streamResponse = await streamPromise;
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get('content-type')).toContain('text/event-stream');
      streamController.abort();

      const createSecond = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'codex' }),
      });
      const session2 = ((await createSecond.json()) as { session: { sessionId: string } }).session
        .sessionId;
      await fetch(`${gateway.baseUrl}/sessions/${session2}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'fail-contract', timeoutMs: 1000 }),
      });
      await sleep(30);

      const metricsResponse = await fetch(`${gateway.baseUrl}/metrics`);
      const metrics = (await metricsResponse.json()) as {
        errors: { byCategory: Record<string, number>; byCode: Record<string, number> };
        prompts: { attempts: number; failed: number };
      };
      expect(metrics.prompts.attempts).toBe(2);
      expect(metrics.prompts.failed).toBe(2);
      expect(metrics.errors.byCategory.provider ?? 0).toBeGreaterThanOrEqual(1);
      expect(metrics.errors.byCode.PROVIDER_PROCESS_EXITED ?? 0).toBeGreaterThanOrEqual(1);
    } finally {
      await gateway.close();
    }
  });
});

function baseConfig(): GatewayConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    version: 'test',
    protocols: ['mcp', 'acp', 'a2a'],
    providers: ['codex'],
    defaultProvider: 'codex',
    codexCommand: 'codex exec -',
    timeoutMs: 30_000,
    retryAttempts: 2,
    maxConcurrentSessions: 32,
    logLevel: 'error',
  };
}

async function startGateway(runtime: ProviderRuntimePort): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const sessionStore = new SessionStore();
  const logger = new Logger('error');
  const metrics = new GatewayMetrics();
  const server = createGatewayServer(baseConfig(), logger, sessionStore, runtime, metrics);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
