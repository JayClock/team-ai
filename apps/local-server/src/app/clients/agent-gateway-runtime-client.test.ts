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

  it('prompts through agent-gateway and replays gateway events as ACP updates', async () => {
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
            payload: {
              type: 'agent_message_chunk',
              content: 'hello from gateway',
            },
            text: 'hello from gateway',
          }),
          gatewayEvent('gw-1:3', 'tool', {
            protocol: 'acp',
            payload: {
              type: 'tool_call',
              toolCallId: 'tool-1',
              toolName: 'read_file',
              arguments: {
                path: 'README.md',
              },
            },
          }),
          gatewayEvent('gw-1:4', 'complete', {
            provider: 'opencode',
            reason: 'prompt-finished',
          }),
        ],
        nextCursor: 'gw-1:4',
        session: gatewaySession('gw-1', 'COMPLETED', 'gw-1:4'),
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
      listEvents,
      prompt,
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
    expect(hooks.onSessionUpdate).toHaveBeenCalledTimes(2);
    const updates = hooks.onSessionUpdate.mock.calls as unknown as Array<
      [unknown]
    >;
    const firstUpdate = updates[0]?.[0];
    const secondUpdate = updates[1]?.[0];

    expect(firstUpdate).toMatchObject({
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: 'hello from gateway',
        },
      },
    });
    expect(secondUpdate).toMatchObject({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        kind: 'read_file',
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
      listEvents: vi.fn(async () => {
        throw new ProblemError({
          type: 'https://team-ai.dev/problems/agent-gateway-request-failed',
          title: 'Agent Gateway Request Failed',
          status: 404,
          detail: 'session not found',
        });
      }),
      prompt: vi.fn(async () => ({
        accepted: true,
        session: gatewaySession('gw-new', 'RUNNING', 'gw-new:1'),
      })),
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
