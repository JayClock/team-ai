import type { McpServer } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '../errors/problem-error';
import type {
  AgentGatewayClient,
  AgentGatewayEventEnvelope,
  AgentGatewaySessionPayload,
} from './agent-gateway-client';
import { createAgentGatewayRuntimeClient } from './agent-gateway-runtime-client';

describe('agent-gateway-runtime-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts through agent-gateway and replays canonical gateway events directly', async () => {
    const hooks = {
      onClosed: vi.fn(),
      onSessionUpdate: vi.fn(async () => undefined),
    };

    const listEvents = vi
      .fn<AgentGatewayClient['listEvents']>()
      .mockResolvedValueOnce({
        events: [
          gatewayEvent('gw-1:2', 'delta', {
            protocol: 'acp',
            update: {
              eventType: 'agent_message',
              message: {
                role: 'assistant',
                content: 'hello from gateway',
                contentBlock: {
                  type: 'text',
                  text: 'hello from gateway',
                },
                isChunk: true,
                messageId: 'msg-1',
              },
              rawNotification: {
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  messageId: 'msg-1',
                  content: {
                    type: 'text',
                    text: 'hello from gateway',
                  },
                },
              },
            },
          }),
          gatewayEvent('gw-1:3', 'tool', {
            protocol: 'acp',
            update: {
              eventType: 'tool_call',
              toolCall: {
                toolCallId: 'tool-1',
                title: 'Read file',
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
          }),
          gatewayEvent('gw-1:4', 'complete', {
            protocol: 'acp',
            update: {
              eventType: 'turn_complete',
              turnComplete: {
                stopReason: 'end_turn',
                usage: null,
                userMessageId: null,
              },
            },
          }),
        ],
        nextCursor: 'gw-1:4',
        session: gatewaySession('gw-1', 'RUNNING', 'gw-1:4'),
      });

    const prompt = vi.fn<AgentGatewayClient['prompt']>(async () => ({
      accepted: true,
      runtime: {
        provider: 'opencode',
      },
      session: gatewaySession('gw-1', 'RUNNING', 'gw-1:1'),
    }));

    const client = createAgentGatewayRuntimeClient({
      cancel: vi.fn(async () => ({
        accepted: true,
        session: gatewaySession('gw-1', 'CANCELLED', 'gw-1:5'),
      })),
      createSession: vi.fn(async () => ({
        session: gatewaySession('gw-1', 'PENDING', 'gw-1:1'),
      })),
      isConfigured: vi.fn(() => true),
      isProviderConfigured: vi.fn((providerId: string) => providerId === 'opencode'),
      listEvents,
      listProviders: vi.fn(),
      prompt,
      refreshProviderCatalog: vi.fn(),
      stream: vi.fn(async () => undefined),
    } satisfies AgentGatewayClient);

    const mcpServers: McpServer[] = [
      {
        type: 'http',
        name: 'team_ai_local',
        url: 'http://127.0.0.1:4310/api/mcp',
        headers: [
          {
            name: 'Authorization',
            value: 'Bearer desktop-token',
          },
        ],
      },
    ];

    await client.createSession({
      localSessionId: 'local-1',
      provider: 'opencode',
      cwd: '/tmp/project',
      mcpServers,
      hooks,
    });

    const result = await client.promptSession({
      localSessionId: 'local-1',
      prompt: 'hello',
      timeoutMs: 2_000,
      traceId: 'trace-1',
    });

    expect(prompt).toHaveBeenCalledWith(
      'gw-1',
      expect.objectContaining({
        input: 'hello',
        traceId: 'trace-1',
        timeoutMs: 2_000,
        cwd: '/tmp/project',
        env: {
          TEAMAI_MCP_TEAM_AI_LOCAL_BEARER_TOKEN: 'desktop-token',
        },
        metadata: {
          mcpServers: [
            expect.objectContaining({
              name: 'team_ai_local',
              url: 'http://127.0.0.1:4310/api/mcp',
              bearerTokenEnvVar: 'TEAMAI_MCP_TEAM_AI_LOCAL_BEARER_TOKEN',
            }),
          ],
        },
      }),
    );
    expect(result.runtimeSessionId).toBe('gw-1');
    expect(result.response.stopReason).toBe('end_turn');
    expect(hooks.onSessionUpdate).toHaveBeenCalledTimes(3);
    const updates = hooks.onSessionUpdate.mock.calls as unknown as Array<
      [unknown]
    >;
    const firstUpdate = updates[0]?.[0];
    const secondUpdate = updates[1]?.[0];
    const thirdUpdate = updates[2]?.[0];

    expect(firstUpdate).toMatchObject({
      eventType: 'agent_message',
      provider: 'opencode',
      message: {
        content: 'hello from gateway',
        isChunk: true,
        messageId: 'msg-1',
      },
    });
    expect(secondUpdate).toMatchObject({
      eventType: 'tool_call',
      toolCall: {
        toolCallId: 'tool-1',
        kind: 'read_file',
      },
    });
    expect(thirdUpdate).toMatchObject({
      eventType: 'turn_complete',
      turnComplete: {
        stopReason: 'end_turn',
      },
    });
  });

  it('recreates missing gateway sessions on load', async () => {
    const client = createAgentGatewayRuntimeClient({
      cancel: vi.fn(async () => ({
        accepted: true,
        session: gatewaySession('gw-new', 'CANCELLED', 'gw-new:2'),
      })),
      createSession: vi.fn(async () => ({
        session: gatewaySession('gw-new', 'PENDING', 'gw-new:1'),
      })),
      isConfigured: vi.fn(() => true),
      isProviderConfigured: vi.fn((providerId: string) => providerId === 'opencode'),
      listEvents: vi.fn(async () => {
        throw new ProblemError({
          type: 'https://team-ai.dev/problems/agent-gateway-request-failed',
          title: 'Agent Gateway Request Failed',
          status: 404,
          detail: 'session not found',
        });
      }),
      listProviders: vi.fn(),
      prompt: vi.fn(async () => ({
        accepted: true,
        session: gatewaySession('gw-new', 'RUNNING', 'gw-new:1'),
      })),
      refreshProviderCatalog: vi.fn(),
      stream: vi.fn(async () => undefined),
    } satisfies AgentGatewayClient);

    const loaded = await client.loadSession({
      localSessionId: 'local-2',
      runtimeSessionId: 'missing-session',
      provider: 'opencode',
      cwd: '/tmp/project',
      mcpServers: [],
      hooks: {
        onClosed: vi.fn(),
        onSessionUpdate: vi.fn(async () => undefined),
      },
    });

    expect(loaded).toEqual({
      provider: 'opencode',
      runtimeSessionId: 'gw-new',
    });
  });

  it('checks provider availability against the gateway catalog cache', () => {
    const client = createAgentGatewayRuntimeClient({
      cancel: vi.fn(),
      createSession: vi.fn(),
      isConfigured: vi.fn(() => true),
      isProviderConfigured: vi.fn((providerId: string) => providerId === 'opencode'),
      installProvider: vi.fn(),
      listEvents: vi.fn(),
      listProviders: vi.fn(),
      prompt: vi.fn(),
      refreshProviderCatalog: vi.fn(),
      stream: vi.fn(),
    } satisfies AgentGatewayClient);

    expect(client.isConfigured('opencode')).toBe(true);
    expect(client.isConfigured('custom-provider')).toBe(false);
  });
});

function gatewayEvent(
  cursor: string,
  type: string,
  data: Record<string, unknown>,
): AgentGatewayEventEnvelope {
  return {
    cursor,
    data,
    emittedAt: new Date().toISOString(),
    eventId: cursor,
    sessionId: 'gw-1',
    traceId: 'trace-1',
    type,
  };
}

function gatewaySession(
  sessionId: string,
  state: string,
  lastCursor: string,
): AgentGatewaySessionPayload {
  return {
    createdAt: new Date().toISOString(),
    lastCursor,
    metadata: {},
    provider: 'opencode',
    sessionId,
    state,
    traceId: 'trace-1',
  };
}
