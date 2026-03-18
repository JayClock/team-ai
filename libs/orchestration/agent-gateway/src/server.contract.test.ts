import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { GatewayConfig } from './config.js';
import { Logger } from './logger.js';
import { GatewayMetrics } from './observability.js';
import type { ProviderManagementPort, ProviderRuntimePort } from './server.js';
import type {
  ProviderPromptRequest,
  ProviderProtocolEvent,
} from './providers/provider-types.js';
import { createGatewayServer } from './server.js';
import { SessionStore } from './session-store.js';

class MockProviderRuntime implements ProviderRuntimePort {
  readonly requests: Array<{
    providerName: string;
    request: ProviderPromptRequest;
  }> = [];
  private readonly active = new Map<
    string,
    {
      onChunk: (chunk: string) => void;
      onEvent: (event: ProviderProtocolEvent) => void;
      onComplete: () => void;
      onError: (error: {
        code: string;
        message: string;
        retryable: boolean;
        retryAfterMs: number;
      }) => void;
    }
  >();

  prompt(
    providerName: string,
    request: ProviderPromptRequest,
    callbacks: {
      onChunk: (chunk: string) => void;
      onEvent: (event: ProviderProtocolEvent) => void;
      onComplete: () => void;
      onError: (error: {
        code: string;
        message: string;
        retryable: boolean;
        retryAfterMs: number;
      }) => void;
    },
  ): void {
    this.requests.push({ providerName, request });
    this.active.set(request.sessionId, callbacks);

    if (request.input.startsWith('slow')) {
      return;
    }

    queueMicrotask(() => {
      if (!this.active.has(request.sessionId)) {
        return;
      }
      if (request.input.startsWith('fail')) {
        callbacks.onError({
          code: 'PROVIDER_PROCESS_EXITED',
          message: 'mock provider failed',
          retryable: true,
          retryAfterMs: 500,
        });
        this.active.delete(request.sessionId);
        return;
      }

      if (request.input.startsWith('structured')) {
        callbacks.onEvent({
          protocol: 'acp',
          update: {
            eventType: 'tool_call',
            provider: providerName,
            sessionId: request.sessionId,
            timestamp: '2026-03-14T00:00:00.000Z',
            traceId: request.traceId,
            rawNotification: {},
            toolCall: {
              toolCallId: 'tool-1',
              title: 'read_file',
              kind: 'read_file',
              status: 'running',
              input: {
                path: 'README.md',
              },
              inputFinalized: true,
              output: null,
              locations: [],
              content: [],
            },
          },
          traceId: request.traceId,
        });
        callbacks.onEvent({
          protocol: 'acp',
          update: {
            eventType: 'agent_message',
            provider: providerName,
            sessionId: request.sessionId,
            timestamp: '2026-03-14T00:00:00.000Z',
            traceId: request.traceId,
            rawNotification: {},
            message: {
              role: 'assistant',
              content: 'structured:hello',
              isChunk: true,
            },
          },
          traceId: request.traceId,
        });
        callbacks.onComplete();
        this.active.delete(request.sessionId);
        return;
      }

      callbacks.onChunk(`mock:${request.input}`);
      callbacks.onComplete();
      this.active.delete(request.sessionId);
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

class MockProviderManagement implements ProviderManagementPort {
  async installProvider(input: {
    distributionType?: 'binary' | 'npx' | 'uvx';
    providerId: string;
  }) {
    return {
      success: true,
      providerId: input.providerId,
      distributionType: input.distributionType ?? 'npx',
      installedAt: '2026-03-13T00:00:00.000Z',
      command: 'npx -y mock-provider',
    };
  }

  async listProviders() {
    return {
      providers: [
        {
          id: 'codex',
          name: 'Codex',
          description: 'OpenAI Codex CLI (via codex-acp wrapper)',
          command: 'codex-acp',
          envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
          distributionTypes: [],
          installable: false,
          installed: false,
          source: 'static' as const,
          status: 'available' as const,
          unavailableReason: null,
        },
      ],
      registry: {
        url: 'https://example.test/registry.json',
        error: null,
        fetchedAt: null,
      },
    };
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
        body: JSON.stringify({
          model: 'openai/gpt-5',
          provider: 'codex',
          metadata: {
            role: 'planner',
            workspaceRoot: '/tmp/repo',
          },
        }),
      });
      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get('x-trace-id')).toBe('trace-contract-1');
      const created = (await createResponse.json()) as {
        session: { sessionId: string; metadata: Record<string, unknown> };
      };
      const sessionId = created.session.sessionId;
      expect(created.session.metadata).toEqual({
        model: 'openai/gpt-5',
        role: 'planner',
        workspaceRoot: '/tmp/repo',
      });

      const promptResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/prompt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Trace-Id': 'trace-contract-1',
          },
          body: JSON.stringify({
            input: 'hello-contract',
            timeoutMs: 2000,
            cwd: '/tmp/repo',
            env: {
              TEAM_AI_STEP: 'planner',
            },
            metadata: {
              stepId: 'step-1',
            },
          }),
        },
      );
      expect(promptResponse.status).toBe(202);
      const promptPayload = (await promptResponse.json()) as {
        runtime: {
          provider: string;
          timeoutMs: number;
          cwd?: string;
          env?: Record<string, string>;
          metadata?: Record<string, unknown>;
        };
      };
      expect(promptPayload.runtime).toMatchObject({
        provider: 'codex',
        timeoutMs: 2000,
        cwd: '/tmp/repo',
        env: {
          TEAM_AI_STEP: 'planner',
        },
        metadata: {
          stepId: 'step-1',
        },
      });
      await sleep(30);
      expect(runtime.requests).toHaveLength(1);
      expect(runtime.requests[0]).toEqual({
        providerName: 'codex',
        request: {
          sessionId,
          input: 'hello-contract',
          model: 'openai/gpt-5',
          timeoutMs: 2000,
          traceId: 'trace-contract-1',
          cwd: '/tmp/repo',
          env: {
            TEAM_AI_STEP: 'planner',
          },
          metadata: {
            stepId: 'step-1',
          },
        },
      });

      const eventsResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/events`,
      );
      expect(eventsResponse.status).toBe(200);
      const eventsPage = (await eventsResponse.json()) as {
        events: Array<{
          cursor: string;
          type: string;
          traceId: string;
          error?: { code: string };
        }>;
      };
      expect(eventsPage.events.length).toBeGreaterThanOrEqual(3);
      expect(eventsPage.events[0]?.type).toBe('status');
      expect(eventsPage.events[1]?.type).toBe('status');
      expect(eventsPage.events[2]?.type).toBe('delta');
      expect(eventsPage.events.at(-1)?.type).toBe('complete');
      expect(eventsPage.events[0]?.traceId).toBe('trace-contract-1');

      const cursor = eventsPage.events[1]?.cursor;
      const replayResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/events?cursor=${encodeURIComponent(cursor)}`,
      );
      const replayPage = (await replayResponse.json()) as {
        events: Array<{ cursor: string }>;
      };
      expect(replayPage.events.length).toBeGreaterThanOrEqual(1);
      expect(replayPage.events[0]?.cursor).not.toBe(cursor);

      const metricsResponse = await fetch(`${gateway.baseUrl}/metrics`);
      expect(metricsResponse.status).toBe(200);
      const metrics = (await metricsResponse.json()) as {
        sessions: { createAttempts: number; createSuccessRate: number };
        prompts: {
          attempts: number;
          completionRate: number;
          firstTokenLatencyMs: { count: number };
        };
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

  it('stores structured provider events as tool and delta envelopes', async () => {
    const runtime = new MockProviderRuntime();
    const gateway = await startGateway(runtime);
    try {
      const createResponse = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'codex' }),
      });
      const created = (await createResponse.json()) as {
        session: { sessionId: string };
      };
      const sessionId = created.session.sessionId;

      const promptResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/prompt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Trace-Id': 'trace-structured-1',
          },
          body: JSON.stringify({
            input: 'structured-contract',
            timeoutMs: 2000,
          }),
        },
      );
      expect(promptResponse.status).toBe(202);

      await sleep(30);

      const eventsResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/events`,
      );
      const eventsPage = (await eventsResponse.json()) as {
        events: Array<{
          type: string;
          data: Record<string, unknown>;
          traceId: string;
        }>;
      };
      const structuredEvents = eventsPage.events.filter(
        (event) => event.traceId === 'trace-structured-1',
      );

      expect(structuredEvents.some((event) => event.type === 'tool')).toBe(
        true,
      );
      expect(
        structuredEvents.some(
          (event) =>
            event.type === 'delta' && event.data.text === 'structured:hello',
        ),
      ).toBe(true);
      expect(structuredEvents.at(-1)?.type).toBe('complete');
    } finally {
      await gateway.close();
    }
  });

  it('rejects prompt env values that are not strings', async () => {
    const runtime = new MockProviderRuntime();
    const gateway = await startGateway(runtime);
    try {
      const createResponse = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'codex' }),
      });
      const created = (await createResponse.json()) as {
        session: { sessionId: string };
      };

      const promptResponse = await fetch(
        `${gateway.baseUrl}/sessions/${created.session.sessionId}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: 'hello-contract',
            timeoutMs: 2000,
            env: {
              TEAM_AI_STEP: 1,
            },
          }),
        },
      );

      expect(promptResponse.status).toBe(400);
      const payload = (await promptResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(payload.error.code).toBe('INVALID_REQUEST_BODY');
      expect(payload.error.message).toContain(
        'env must be a JSON object with string values',
      );
      expect(runtime.requests).toHaveLength(0);
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
      const created = (await createResponse.json()) as {
        session: { sessionId: string };
      };
      const sessionId = created.session.sessionId;

      const streamController = new AbortController();
      const streamPromise = fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/stream`,
        {
          method: 'GET',
          signal: streamController.signal,
        },
      );

      const promptResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: 'slow-contract', timeoutMs: 5000 }),
        },
      );
      expect(promptResponse.status).toBe(202);

      const cancelResponse = await fetch(
        `${gateway.baseUrl}/sessions/${sessionId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'cancel by contract test' }),
        },
      );
      expect(cancelResponse.status).toBe(202);

      const streamResponse = await streamPromise;
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      streamController.abort();

      const createSecond = await fetch(`${gateway.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'codex' }),
      });
      const session2 = (
        (await createSecond.json()) as { session: { sessionId: string } }
      ).session.sessionId;
      await fetch(`${gateway.baseUrl}/sessions/${session2}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'fail-contract', timeoutMs: 1000 }),
      });
      await sleep(30);

      const metricsResponse = await fetch(`${gateway.baseUrl}/metrics`);
      const metrics = (await metricsResponse.json()) as {
        errors: {
          byCategory: Record<string, number>;
          byCode: Record<string, number>;
        };
        prompts: { attempts: number; failed: number };
      };
      expect(metrics.prompts.attempts).toBe(2);
      expect(metrics.prompts.failed).toBe(2);
      expect(metrics.errors.byCategory.provider ?? 0).toBeGreaterThanOrEqual(1);
      expect(
        metrics.errors.byCode.PROVIDER_PROCESS_EXITED ?? 0,
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await gateway.close();
    }
  });

  it('exposes provider catalog and install endpoints', async () => {
    const gateway = await startGateway(new MockProviderRuntime());
    try {
      const providersResponse = await fetch(
        `${gateway.baseUrl}/providers?registry=true`,
      );
      expect(providersResponse.status).toBe(200);
      const providersPayload = (await providersResponse.json()) as {
        providers: Array<{ id: string; envCommandKey: string }>;
        registry: { url: string };
      };
      expect(providersPayload.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'codex',
            envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
          }),
        ]),
      );
      expect(providersPayload.registry.url).toBe(
        'https://example.test/registry.json',
      );

      const installResponse = await fetch(
        `${gateway.baseUrl}/providers/install`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            providerId: 'codex',
            distributionType: 'npx',
          }),
        },
      );
      expect(installResponse.status).toBe(200);
      const installPayload = (await installResponse.json()) as {
        providerId: string;
        distributionType: string;
        success: boolean;
      };
      expect(installPayload).toMatchObject({
        providerId: 'codex',
        distributionType: 'npx',
        success: true,
      });
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
    timeoutMs: 300_000,
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
  const providerManagement = new MockProviderManagement();
  const server = createGatewayServer(
    baseConfig(),
    logger,
    sessionStore,
    runtime,
    providerManagement,
    metrics,
  );

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
