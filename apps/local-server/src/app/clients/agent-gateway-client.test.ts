import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '../errors/problem-error';
import { createAgentGatewayClient } from './agent-gateway-client';

describe('agent-gateway-client', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    }
  });

  it('supports session create, prompt, cancel, and event listing', async () => {
    const server = http.createServer((request, response) => {
      if (request.url === '/sessions' && request.method === 'POST') {
        response.writeHead(201, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            session: {
              provider: 'codex',
              sessionId: 'session-1',
              state: 'PENDING',
            },
          }),
        );
        return;
      }

      if (request.url === '/sessions/session-1/prompt' && request.method === 'POST') {
        response.writeHead(202, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            accepted: true,
            runtime: { provider: 'codex' },
            session: { sessionId: 'session-1', state: 'RUNNING' },
          }),
        );
        return;
      }

      if (request.url === '/sessions/session-1/cancel' && request.method === 'POST') {
        response.writeHead(202, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            accepted: true,
            session: { sessionId: 'session-1', state: 'CANCELLED' },
          }),
        );
        return;
      }

      if (request.url === '/sessions/session-1/events?cursor=cursor-1') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            cursor: 'cursor-1',
            nextCursor: 'cursor-2',
            events: [{ cursor: 'cursor-2', type: 'delta' }],
            session: { sessionId: 'session-1', state: 'RUNNING' },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'not found' } }));
    });
    servers.push(server);
    await listen(server);

    const baseUrl = urlFor(server);
    const client = createAgentGatewayClient(baseUrl);

    await expect(client.createSession({ provider: 'codex' })).resolves.toEqual({
      session: {
        provider: 'codex',
        sessionId: 'session-1',
        state: 'PENDING',
      },
    });
    await expect(
      client.prompt('session-1', { input: 'hello', timeoutMs: 1000 }),
    ).resolves.toEqual({
      accepted: true,
      runtime: { provider: 'codex' },
      session: { sessionId: 'session-1', state: 'RUNNING' },
    });
    await expect(client.cancel('session-1', { reason: 'stop' })).resolves.toEqual({
      accepted: true,
      session: { sessionId: 'session-1', state: 'CANCELLED' },
    });
    await expect(client.listEvents('session-1', 'cursor-1')).resolves.toEqual({
      cursor: 'cursor-1',
      nextCursor: 'cursor-2',
      events: [{ cursor: 'cursor-2', type: 'delta' }],
      session: { sessionId: 'session-1', state: 'RUNNING' },
    });
  });

  it('supports provider listing and install', async () => {
    const server = http.createServer((request, response) => {
      if (request.url === '/providers?registry=true' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            providers: [
              {
                id: 'codex',
                name: 'Codex',
                description: 'OpenAI Codex CLI (via codex app-server)',
                command: 'codex',
                envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
                distributionTypes: [],
                installable: false,
                installed: false,
                source: 'static',
                status: 'available',
                unavailableReason: null,
              },
            ],
            registry: {
              url: 'https://example.test/registry.json',
              error: null,
              fetchedAt: null,
            },
          }),
        );
        return;
      }

      if (request.url === '/providers/install' && request.method === 'POST') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            providerId: 'codex',
            distributionType: 'npx',
            installedAt: '2026-03-13T00:00:00.000Z',
            success: true,
            command: 'npx -y mock-provider',
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'not found' } }));
    });
    servers.push(server);
    await listen(server);

    const client = createAgentGatewayClient(urlFor(server));

    expect(client.isProviderConfigured('codex')).toBe(true);

    await expect(
      client.listProviders({ includeRegistry: true }),
    ).resolves.toMatchObject({
      providers: [
        expect.objectContaining({
          id: 'codex',
          envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
        }),
      ],
      registry: {
        url: 'https://example.test/registry.json',
      },
    });
    expect(client.isProviderConfigured('codex')).toBe(true);
    expect(client.isProviderConfigured('custom-provider')).toBe(false);
    await expect(
      client.installProvider({
        providerId: 'codex',
        distributionType: 'npx',
      }),
    ).resolves.toMatchObject({
      providerId: 'codex',
      distributionType: 'npx',
      success: true,
    });
  });

  it('parses gateway stream events', async () => {
    const server = http.createServer((request, response) => {
      if (request.url === '/sessions/session-1/stream') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
        });
        response.write('event: connected\n');
        response.write('data: {"sessionId":"session-1"}\n\n');
        response.write('event: delta\n');
        response.write('data: {"text":"hello"}\n\n');
        response.end();
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'not found' } }));
    });
    servers.push(server);
    await listen(server);

    const events: Array<{ data: unknown; event: string }> = [];
    const client = createAgentGatewayClient(urlFor(server));

    await client.stream('session-1', {
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      {
        event: 'connected',
        data: { sessionId: 'session-1' },
      },
      {
        event: 'delta',
        data: { text: 'hello' },
      },
    ]);
  });

  it('maps gateway and transport failures to ProblemError', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'gateway exploded' } }));
    });
    servers.push(server);
    await listen(server);

    const failingClient = createAgentGatewayClient(urlFor(server));

    await expect(failingClient.createSession()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ProblemError &&
        error.message === 'gateway exploded' &&
        error.status === 500 &&
        error.title === 'Agent Gateway Request Failed' &&
        error.type ===
          'https://team-ai.dev/problems/agent-gateway-request-failed',
    );

    const unavailableClient = createAgentGatewayClient('http://127.0.0.1:1');

    await expect(unavailableClient.createSession()).rejects.toMatchObject({
      status: 503,
      title: 'Agent Gateway Unavailable',
      type: 'https://team-ai.dev/problems/agent-gateway-unavailable',
    });
  });

  it('reports unconfigured state through isConfigured', async () => {
    const client = createAgentGatewayClient(null);

    expect(client.isConfigured()).toBe(false);
    expect(client.isProviderConfigured('codex')).toBe(false);
  });
});

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function urlFor(server: http.Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
