import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
  AcpSessionHistory,
  AcpSessionSummary,
  Project,
} from '@shared/schema';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAcpSession } from './use-acp-session';

const useClientMock = vi.fn();

vi.mock('@hateoas-ts/resource-react', () => ({
  useClient: () => useClientMock(),
}));

type RpcMethod =
  | 'session/new'
  | 'session/load'
  | 'session/prompt'
  | 'session/cancel';

type RpcInvocation = {
  method: RpcMethod;
  params: Record<string, unknown>;
};

function event(eventId: string): AcpEventEnvelope {
  const emittedAt = '2026-03-04T00:00:00Z';
  return {
    eventId,
    sessionId: 's-1',
    emittedAt,
    error: null,
    update: {
      eventType: 'available_commands_update',
      provider: 'codex',
      rawNotification: null,
      sessionId: 's-1',
      timestamp: emittedAt,
      availableCommands: [],
    },
  };
}

function createFixture() {
  const historyCalls: Array<Record<string, string | number>> = [];
  const rpcInvocations: RpcInvocation[] = [];

  const sessionData: AcpSession['data'] = {
    acpError: null,
    acpStatus: 'ready',
    id: 's-1',
    project: { id: 'p-1' },
    agent: { id: 'agent-1' },
    actor: { id: 'u-1' },
    cancelRequestedAt: null,
    cancelledAt: null,
    codebase: null,
    deadlineAt: null,
    forceKilledAt: null,
    inactiveDeadlineAt: null,
    parentSession: null,
    model: null,
    name: 'Session 1',
    provider: 'codex',
    specialistId: 'routa-coordinator',
    state: 'RUNNING',
    stepCount: 0,
    supervisionPolicy: {
      cancelGraceMs: 1000,
      completionGraceMs: 1000,
      inactivityTimeoutMs: 600000,
      maxRetries: 0,
      maxSteps: 64,
      packageManagerInitTimeoutMs: 120000,
      promptTimeoutMs: 300000,
      providerInitTimeoutMs: 10000,
      totalTimeoutMs: 1800000,
    },
    timeoutScope: null,
    cwd: '/tmp/project',
    startedAt: '2026-03-04T00:00:00Z',
    lastActivityAt: '2026-03-04T00:00:00Z',
    completedAt: null,
    failureReason: null,
    lastEventId: { id: 'evt-1' },
    worktree: null,
  };

  const historyBySince: Record<string, AcpEventEnvelope[]> = {
    __all: [event('evt-1')],
    'evt-1': [event('evt-2')],
    'evt-2': [event('evt-3')],
  };

  const sessionState = {
    data: sessionData,
    collection: [],
    hasLink: vi.fn(() => true),
    follow: vi.fn((rel: string, query?: Record<string, string | number>) => {
      if (rel === 'self') {
        return {
          get: vi.fn(async () => sessionState as unknown as State<AcpSession>),
        };
      }
      if (rel === 'history') {
        const normalizedQuery = query ?? { limit: 200 };
        historyCalls.push(normalizedQuery);
        const since = normalizedQuery.since as string | undefined;
        const rows = historyBySince[since ?? '__all'] ?? [];
        return {
          get: vi.fn(
            async () =>
              ({
                data: {
                  projectId: 'p-1',
                  sessionId: 's-1',
                  history: rows,
                },
                collection: [],
                hasLink: vi.fn(() => false),
                follow: vi.fn(),
              }) as unknown as State<AcpSessionHistory>,
          ),
        };
      }
      throw new Error(`Unsupported rel: ${rel}`);
    }),
  } as unknown as State<AcpSession>;

  const summaryState = {
    data: sessionData,
    collection: [],
    hasLink: vi.fn((rel: string) => rel === 'self'),
    follow: vi.fn((rel: string) => {
      if (rel !== 'self') {
        throw new Error(`Unsupported summary rel: ${rel}`);
      }
      return {
        get: vi.fn(async () => sessionState),
      };
    }),
  } as unknown as State<AcpSessionSummary>;

  const sessionsCollectionState = {
    data: {},
    collection: [summaryState],
    hasLink: vi.fn(() => false),
    follow: vi.fn(),
  } as unknown as State<AcpSessionSummary>;

  const sessionsResource = {
    refresh: vi.fn(async () => sessionsCollectionState),
  };

  const projectState = {
    data: {
      id: 'p-1',
      title: 'Project 1',
      description: null,
      repoPath: '/tmp/project',
      sourceType: 'local',
      sourceUrl: null,
      createdAt: '2026-03-04T00:00:00Z',
      updatedAt: '2026-03-04T00:00:00Z',
    },
    collection: [],
    hasLink: vi.fn(() => true),
    follow: vi.fn((rel: string) => {
      if (rel !== 'acp-sessions') {
        throw new Error(`Unsupported project rel: ${rel}`);
      }
      return sessionsResource;
    }),
  } as unknown as State<Project>;

  const client = {
    go: vi.fn((uri: string) => {
      if (uri !== '/api/acp') {
        throw new Error(`Unsupported uri: ${uri}`);
      }
      return {
        post: vi.fn(
          async (request: {
            data: { method: RpcMethod; params: Record<string, unknown> };
          }) => {
            const method = request.data.method;
            rpcInvocations.push({
              method,
              params: request.data.params,
            });
            if (method === 'session/new') {
              return {
                data: {
                  jsonrpc: '2.0',
                  id: 'r-1',
                  result: {
                    session: {
                      acpStatus: 'connecting',
                      id: 's-1',
                    },
                  },
                  error: null,
                },
              };
            }
            if (method === 'session/load') {
              return {
                data: {
                  jsonrpc: '2.0',
                  id: 'r-2',
                  result: {
                    session: {
                      acpStatus: sessionData.acpStatus,
                      id: 's-1',
                    },
                  },
                  error: null,
                },
              };
            }
            if (method === 'session/prompt') {
              sessionData.lastEventId = { id: 'evt-2' };
              return {
                data: {
                  jsonrpc: '2.0',
                  id: 'r-3',
                  result: {
                    session: {
                      acpStatus: 'ready',
                      id: 's-1',
                    },
                    runtime: { output: 'ok' },
                  },
                  error: null,
                },
              };
            }
            sessionData.lastEventId = { id: 'evt-3' };
            return {
              data: {
                jsonrpc: '2.0',
                id: 'r-4',
                result: {
                  session: {
                    acpStatus: 'ready',
                    id: 's-1',
                  },
                },
                error: null,
              },
            };
          },
        ),
      };
    }),
  };

  return {
    client,
    historyCalls,
    projectState,
    rpcInvocations,
    sessionsResource,
  };
}

describe('useAcpSession', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session and replays initial history', async () => {
    const fixture = createFixture();
    useClientMock.mockReturnValue(fixture.client);

    const { result } = renderHook(() =>
      useAcpSession(fixture.projectState, {
        role: 'DEVELOPER',
      }),
    );

    await act(async () => {
      await result.current.create({
        actorUserId: 'u-1',
      });
    });

    await waitFor(() => {
      expect(result.current.selectedSession?.data.id).toBe('s-1');
      expect(
        result.current.history.map((item: AcpEventEnvelope) => item.eventId),
      ).toEqual(['evt-1']);
      expect(fixture.sessionsResource.refresh).toHaveBeenCalledTimes(1);
    });
    expect(fixture.rpcInvocations[0]).toEqual({
      method: 'session/new',
      params: {
        projectId: 'p-1',
        actorUserId: 'u-1',
        cwd: undefined,
        model: null,
        provider: null,
        role: 'DEVELOPER',
        parentSessionId: undefined,
        idempotencyKey: undefined,
        goal: undefined,
      },
    });
  });

  it('passes cwd override when creating a session', async () => {
    const fixture = createFixture();
    useClientMock.mockReturnValue(fixture.client);

    const { result } = renderHook(() => useAcpSession(fixture.projectState));

    await act(async () => {
      await result.current.create({
        actorUserId: 'u-1',
        cwd: '/tmp/alternate-repo',
      });
    });

    expect(fixture.rpcInvocations[0]).toEqual({
      method: 'session/new',
      params: {
        projectId: 'p-1',
        actorUserId: 'u-1',
        cwd: '/tmp/alternate-repo',
        model: null,
        provider: null,
        role: undefined,
        parentSessionId: undefined,
        idempotencyKey: undefined,
        goal: undefined,
      },
    });
  });

  it('passes model override when creating a session', async () => {
    const fixture = createFixture();
    useClientMock.mockReturnValue(fixture.client);

    const { result } = renderHook(() => useAcpSession(fixture.projectState));

    await act(async () => {
      await result.current.create({
        actorUserId: 'u-1',
        model: 'gpt-5',
      });
    });

    expect(fixture.rpcInvocations[0]).toEqual({
      method: 'session/new',
      params: {
        projectId: 'p-1',
        actorUserId: 'u-1',
        cwd: undefined,
        model: 'gpt-5',
        provider: null,
        role: undefined,
        parentSessionId: undefined,
        idempotencyKey: undefined,
        goal: undefined,
      },
    });
  });

  it('loads session by id through rpc load + sessions collection traversal', async () => {
    const fixture = createFixture();
    useClientMock.mockReturnValue(fixture.client);
    const { result } = renderHook(() => useAcpSession(fixture.projectState));

    await act(async () => {
      await result.current.select({ session: 's-1' });
    });

    expect(fixture.rpcInvocations[0]).toEqual({
      method: 'session/load',
      params: {
        projectId: 'p-1',
        sessionId: 's-1',
      },
    });
    expect(result.current.selectedSession?.data.id).toBe('s-1');
    expect(fixture.historyCalls[0]).toEqual({ limit: 200 });
  });

  it('prompts and cancels with incremental history replay', async () => {
    const fixture = createFixture();
    useClientMock.mockReturnValue(fixture.client);
    const { result } = renderHook(() => useAcpSession(fixture.projectState));

    await act(async () => {
      await result.current.select({ session: 's-1', load: false });
    });

    await act(async () => {
      await result.current.prompt({
        prompt: 'hello',
      });
    });

    await act(async () => {
      await result.current.cancel({
        reason: 'stop',
      });
    });

    expect(
      result.current.history.map((item: AcpEventEnvelope) => item.eventId),
    ).toEqual(['evt-1', 'evt-2', 'evt-3']);
    expect(
      fixture.rpcInvocations.map((invocation) => invocation.method),
    ).toContain('session/prompt');
    expect(
      fixture.rpcInvocations.map((invocation) => invocation.method),
    ).toContain('session/cancel');
    expect(fixture.historyCalls).toEqual([
      { limit: 200 },
      { since: 'evt-1', limit: 200 },
      { since: 'evt-2', limit: 200 },
    ]);
    expect(result.current.selectedSession?.data.acpStatus).toBe('ready');
  });
});
