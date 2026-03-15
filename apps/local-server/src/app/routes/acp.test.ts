import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
} from '../clients/acp-runtime-client';
import { ProblemError } from '../errors/problem-error';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { createAcpSession, getAcpSessionById } from '../services/acp-service';
import { createProject } from '../services/project-service';
import { listTaskRuns } from '../services/task-run-service';
import { createTask, getTaskById } from '../services/task-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import acpRoute from './acp';
import agentsRoute from './agents';
import meRoute from './me';
import projectsRoute from './projects';
import rootRoute from './root';
import tasksRoute from './tasks';

describe('acp route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const originalDataDir = process.env.TEAMAI_DATA_DIR;
  const originalDesktopSessionToken = process.env.DESKTOP_SESSION_TOKEN;
  const originalHost = process.env.HOST;
  const originalPort = process.env.PORT;
  const originalCodexCommand = process.env.TEAMAI_ACP_CODEX_COMMAND;

  afterEach(async () => {
    process.env.TEAMAI_DATA_DIR = originalDataDir;
    process.env.DESKTOP_SESSION_TOKEN = originalDesktopSessionToken;
    process.env.HOST = originalHost;
    process.env.PORT = originalPort;
    process.env.TEAMAI_ACP_CODEX_COMMAND = originalCodexCommand;
    vi.unstubAllGlobals();

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('creates desktop acp sessions from role defaults and exposes history/resources from local-server', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-test-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const promptMock = vi.fn(async () => ({
      runtimeSessionId: 'runtime-1',
      response: {
        stopReason: 'end_turn' as const,
      },
    }));

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: 'runtime-1',
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: promptMock,
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Project',
      repoPath: '/tmp/team-ai-desktop-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json();
    const sessionId = createBody.result.session.id as string;

    const agentsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents`,
    });

    expect(agentsResponse.statusCode).toBe(200);
    expect(agentsResponse.json()._embedded.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Solo Developer',
          role: 'DEVELOPER',
          provider: 'codex',
          specialistId: 'solo-developer',
        }),
      ]),
    );

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-2',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId,
          prompt: 'hello desktop acp',
        },
      },
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(promptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        localSessionId: sessionId,
        timeoutMs: undefined,
        eventId: undefined,
        traceId: undefined,
      }),
    );
    const promptCalls = promptMock.mock.calls as unknown as Array<
      [{ prompt: string }]
    >;
    const promptInput = promptCalls[0]?.[0];
    expect(promptInput?.prompt).toContain(
      'Operate as the single worker for DEVELOPER orchestration mode.',
    );
    expect(promptInput?.prompt).toContain('Unlike ROUTA');
    expect(promptInput?.prompt).toContain(
      'Child-session dispatch is off by default in solo mode.',
    );
    expect(promptInput?.prompt).toContain('User:\nhello desktop acp');

    const sessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });

    expect(sessionsResponse.statusCode).toBe(200);
    expect(responseContentType(sessionsResponse)).toBe(
      VENDOR_MEDIA_TYPES.acpSessions,
    );
    expect(sessionsResponse.json()._embedded.sessions).toHaveLength(1);
    expect(sessionsResponse.json()._embedded.sessions[0]).toMatchObject({
      agent: {
        id: expect.stringMatching(/^agent_/),
      },
      specialistId: 'solo-developer',
    });

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(responseContentType(historyResponse)).toBe(
      VENDOR_MEDIA_TYPES.acpHistory,
    );
    expect(
      historyResponse
        .json()
        .history.map(
          (event: { update: { eventType: string } }) => event.update.eventType,
        ),
    ).toEqual(
      expect.arrayContaining(['user_message', 'turn_complete']),
    );

    const rootResponse = await fastify.inject({
      method: 'GET',
      url: '/api',
    });
    expect(rootResponse.json()._links.me.href).toBe('/api/me');
    expect(rootResponse.json()._links.acp.href).toBe('/api/acp');
  });

  it('normalizes codex-acp to codex when creating desktop acp sessions', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-alias-test-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: 'runtime-alias',
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Alias Project',
      repoPath: '/tmp/team-ai-desktop-alias-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-alias',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex-acp',
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(fastify.acpRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'codex',
      }),
    );

    const sessionId = createResponse.json().result.session.id as string;
    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.provider).toBe('codex');
  });

  it('creates task-bound child sessions and syncs execution state back to project_tasks', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-bound-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4311';

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-child',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Task Project',
      repoPath: '/tmp/team-ai-desktop-task-project',
    });

    const rootResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'root-session',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          role: 'ROUTA',
        },
      },
    });

    const rootSessionId = rootResponse.json().result.session.id as string;
    const task = await createTask(fastify.sqlite, {
      objective: 'Implement the routed task',
      projectId: project.id,
      title: 'Implement routed task',
      sessionId: rootSessionId,
      assignedRole: 'CRAFTER',
      status: 'READY',
    });

    const childSession = await createAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
        parentSessionId: rootSessionId,
        role: 'CRAFTER',
        taskId: task.id,
      },
      {
        logger: fastify.log,
        source: 'acp-route-test',
      },
    );
    const childSessionId = childSession.id;

    const childSessionResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${childSessionId}`,
    });

    expect(childSessionResponse.json()).toMatchObject({
      parentSession: { id: rootSessionId },
      specialistId: 'crafter-implementor',
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(updatedTask).toMatchObject({
      executionSessionId: childSessionId,
      resultSessionId: null,
      status: 'RUNNING',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        completedAt: null,
        isLatest: true,
        kind: 'implement',
        provider: 'codex',
        role: 'CRAFTER',
        sessionId: childSessionId,
        specialistId: 'crafter-implementor',
        startedAt: expect.any(String),
        status: 'RUNNING',
        taskId: task.id,
      }),
    ]);
  });

  it('moves task-bound child session creation failures into waiting retry with a failed run', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-run-create-fail-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4313';

    let createCount = 0;
    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => {
        createCount += 1;

        if (createCount === 1) {
          return {
            runtimeSessionId: `runtime-${input.localSessionId}`,
            provider: input.provider,
          };
        }

        throw new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-not-configured',
          title: 'ACP Provider Not Configured',
          status: 503,
          detail: 'Provider codex is unavailable',
        });
      }),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'unused',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Task Run Create Failure Project',
      repoPath: '/tmp/team-ai-desktop-task-run-create-failure-project',
    });

    const rootResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'root-session-create-failure',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          role: 'ROUTA',
        },
      },
    });

    expect(rootResponse.statusCode).toBe(200);
    const rootSessionId = rootResponse.json().result.session.id as string;
    const task = await createTask(fastify.sqlite, {
      objective: 'Record child session creation failures cleanly',
      projectId: project.id,
      title: 'Child session creation failure task',
      sessionId: rootSessionId,
      assignedRole: 'CRAFTER',
      status: 'READY',
    });

    await expect(
      createAcpSession(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          parentSessionId: rootSessionId,
          role: 'CRAFTER',
          taskId: task.id,
        },
        {
          logger: fastify.log,
          source: 'acp-route-test',
        },
      ),
    ).rejects.toThrow('Provider codex is unavailable');

    const failedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });
    const failedChildSessionId = taskRuns.items[0]
      ? { id: taskRuns.items[0].sessionId as string }
      : null;

    if (!failedChildSessionId?.id) {
      throw new Error('Expected a failed child session to be recorded');
    }

    const failedChildSession = await getAcpSessionById(
      fastify.sqlite,
      failedChildSessionId.id,
    );

    expect(failedChildSession).toMatchObject({
      acpStatus: 'error',
      id: failedChildSessionId.id,
      failureReason: 'Provider codex is unavailable',
    });
    expect(failedTask).toMatchObject({
      completionSummary: 'Provider codex is unavailable',
      executionSessionId: null,
      resultSessionId: failedChildSessionId.id,
      status: 'WAITING_RETRY',
      verificationReport: 'Provider codex is unavailable',
      verificationVerdict: 'fail',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        isLatest: true,
        sessionId: failedChildSessionId.id,
        status: 'FAILED',
        summary: 'Provider codex is unavailable',
        taskId: task.id,
        verificationReport: 'Provider codex is unavailable',
        verificationVerdict: 'fail',
      }),
    ]);
    expect(taskRuns.items[0]?.completedAt).toEqual(expect.any(String));
  });

  it('completes task runs when task-bound prompts finish successfully', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-run-complete-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4314';

    const sessionHooks = new Map<string, AcpRuntimeSessionHooks>();
    const assistantReply = 'Implemented the routed task successfully.';
    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => {
        sessionHooks.set(input.localSessionId, input.hooks);
        return {
          runtimeSessionId: `runtime-${input.localSessionId}`,
          provider: input.provider,
        };
      }),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => {
        const hooks = sessionHooks.get(input.localSessionId);
        expect(hooks).toBeDefined();

        await hooks?.onSessionUpdate({
          eventType: 'agent_message',
          message: {
            content: assistantReply,
            contentBlock: {
              type: 'text',
              text: assistantReply,
            },
            isChunk: true,
            messageId: 'assistant-msg-1',
            role: 'assistant',
          },
          provider: input.provider,
          rawNotification: {
            update: {
              sessionUpdate: 'agent_message_chunk',
              messageId: 'assistant-msg-1',
              content: {
                type: 'text',
                text: assistantReply,
              },
            },
          },
          sessionId: input.localSessionId,
          timestamp: '2026-03-15T00:00:00.000Z',
        } as Parameters<AcpRuntimeSessionHooks['onSessionUpdate']>[0]);

        return {
          runtimeSessionId: `runtime-${input.localSessionId}`,
          response: {
            stopReason: 'end_turn' as const,
          },
        };
      }),
    } satisfies AcpRuntimeClient);

    const { childSessionId, project, task } =
      await createTaskBoundSessionFixture(
        fastify,
        'Desktop ACP Task Run Completion Project',
      );

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'child-prompt-success',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId: childSessionId,
          prompt: 'Finish the implementation task',
        },
      },
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptResponse.json()).toMatchObject({
      result: {
        session: {
          acpStatus: 'ready',
          id: childSessionId,
        },
      },
    });
    expect(updatedTask).toMatchObject({
      completionSummary: assistantReply,
      executionSessionId: null,
      resultSessionId: childSessionId,
      status: 'COMPLETED',
      verificationReport: assistantReply,
      verificationVerdict: 'pass',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        isLatest: true,
        sessionId: childSessionId,
        status: 'COMPLETED',
        summary: assistantReply,
        taskId: task.id,
        verificationReport: assistantReply,
        verificationVerdict: 'pass',
      }),
    ]);
    expect(taskRuns.items[0]?.completedAt).toEqual(expect.any(String));
  });

  it('fails task runs when task-bound prompts error', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-run-fail-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4315';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => {
        throw new Error('Provider request failed');
      }),
    } satisfies AcpRuntimeClient);

    const { childSessionId, project, task } =
      await createTaskBoundSessionFixture(
        fastify,
        'Desktop ACP Task Run Failure Project',
      );

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'child-prompt-failure',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId: childSessionId,
          prompt: 'Attempt the implementation task',
        },
      },
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptResponse.json()).toEqual({
      error: {
        code: -32000,
        message: 'Provider request failed',
      },
      id: 'child-prompt-failure',
      jsonrpc: '2.0',
      result: null,
    });
    expect(updatedTask).toMatchObject({
      completionSummary: 'Provider request failed',
      executionSessionId: null,
      resultSessionId: childSessionId,
      status: 'FAILED',
      verificationReport: 'Provider request failed',
      verificationVerdict: 'fail',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        isLatest: true,
        sessionId: childSessionId,
        status: 'FAILED',
        summary: 'Provider request failed',
        taskId: task.id,
        verificationReport: 'Provider request failed',
        verificationVerdict: 'fail',
      }),
    ]);
    expect(taskRuns.items[0]?.completedAt).toEqual(expect.any(String));
  });

  it('moves timed out task-bound prompts into waiting retry while keeping the run failed', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-run-timeout-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4317';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => {
        throw new ProblemError({
          type: 'https://team-ai.dev/problems/acp-prompt-timeout',
          title: 'ACP Prompt Timed Out',
          status: 504,
          detail: 'ACP prompt exceeded timeout of 1000ms',
        });
      }),
    } satisfies AcpRuntimeClient);

    const { childSessionId, project, task } =
      await createTaskBoundSessionFixture(
        fastify,
        'Desktop ACP Task Run Timeout Project',
      );

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'child-prompt-timeout',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId: childSessionId,
          prompt: 'Attempt the implementation task within the timeout budget',
          timeoutMs: 1000,
        },
      },
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptResponse.json()).toEqual({
      error: {
        code: -32000,
        message: 'ACP prompt exceeded timeout of 1000ms',
      },
      id: 'child-prompt-timeout',
      jsonrpc: '2.0',
      result: null,
    });
    expect(updatedTask).toMatchObject({
      completionSummary: 'ACP prompt exceeded timeout of 1000ms',
      executionSessionId: null,
      resultSessionId: childSessionId,
      status: 'WAITING_RETRY',
      verificationReport: 'ACP prompt exceeded timeout of 1000ms',
      verificationVerdict: 'fail',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        isLatest: true,
        sessionId: childSessionId,
        status: 'FAILED',
        summary: 'ACP prompt exceeded timeout of 1000ms',
        taskId: task.id,
        verificationReport: 'ACP prompt exceeded timeout of 1000ms',
        verificationVerdict: 'fail',
      }),
    ]);
    expect(taskRuns.items[0]?.completedAt).toEqual(expect.any(String));
  });

  it('cancels task runs when task-bound sessions are cancelled', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-task-run-cancel-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4316';

    const cancelRuntimeSession = vi.fn(async () => undefined);
    const fastify = await createFullAcpServer({
      cancelSession: cancelRuntimeSession,
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'unused',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const { childSessionId, project, task } =
      await createTaskBoundSessionFixture(
        fastify,
        'Desktop ACP Task Run Cancel Project',
      );

    const cancelResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'child-session-cancel',
        method: 'session/cancel',
        params: {
          projectId: project.id,
          sessionId: childSessionId,
          reason: 'User aborted execution',
        },
      },
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelRuntimeSession).toHaveBeenCalledWith({
      localSessionId: childSessionId,
      reason: 'User aborted execution',
    });
    expect(cancelResponse.json()).toMatchObject({
      result: {
        session: {
          acpStatus: 'ready',
          id: childSessionId,
        },
      },
    });
    expect(updatedTask).toMatchObject({
      completionSummary: 'User aborted execution',
      executionSessionId: null,
      resultSessionId: childSessionId,
      status: 'CANCELLED',
      verificationReport: 'User aborted execution',
      verificationVerdict: 'cancelled',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        isLatest: true,
        sessionId: childSessionId,
        status: 'CANCELLED',
        summary: 'User aborted execution',
        taskId: task.id,
        verificationReport: 'User aborted execution',
        verificationVerdict: 'cancelled',
      }),
    ]);
    expect(taskRuns.items[0]?.completedAt).toEqual(expect.any(String));
  });

  it('records ROUTA plan events without auto-creating project tasks or child sessions', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-plan-sync-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4312';

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const sessionHooks = new Map<string, AcpRuntimeSessionHooks>();

    const createRuntimeSession = vi.fn(async (input) => {
      sessionHooks.set(input.localSessionId, input.hooks);

      return {
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      };
    });
    const promptRuntimeSession = vi.fn(async (input) => {
      return {
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      };
    });

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: createRuntimeSession,
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: promptRuntimeSession,
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Plan Sync Project',
      repoPath: '/tmp/team-ai-desktop-plan-sync-project',
    });

    const rootResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'plan-root-session',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          role: 'ROUTA',
        },
      },
    });

    expect(rootResponse.statusCode).toBe(200);
    const rootSessionId = rootResponse.json().result.session.id as string;

    const rootSessionHooks = sessionHooks.get(rootSessionId) ?? null;
    expect(rootSessionHooks).not.toBeNull();
    if (!rootSessionHooks) {
      throw new Error('Expected ACP runtime hooks for the root session');
    }
    const rootHooks = rootSessionHooks as AcpRuntimeSessionHooks;
    const planEntries: Array<{
      content: string;
      priority: 'high' | 'medium';
      status: 'pending' | 'completed';
    }> = [
      {
        content: 'Implement automatic ACP task sync',
        priority: 'high',
        status: 'pending',
      },
      {
        content: 'Verify workbench reflects synced tasks',
        priority: 'medium',
        status: 'completed',
      },
    ];

    await rootHooks.onSessionUpdate({
      eventType: 'plan_update',
      planItems: planEntries.map((entry) => ({
        description: entry.content,
        priority: entry.priority,
        status: entry.status,
      })),
      provider: 'codex',
      rawNotification: {
        update: {
          entries: planEntries,
          sessionUpdate: 'plan',
        },
      },
      sessionId: rootSessionId,
      timestamp: '2026-03-15T00:00:00.000Z',
    } as Parameters<AcpRuntimeSessionHooks['onSessionUpdate']>[0]);

    const tasksResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/tasks`,
    });
    const syncedTasks = tasksResponse.json()._embedded.tasks as Array<{
      title: string;
    }>;

    const sessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });
    const sessions = sessionsResponse.json()._embedded.sessions as Array<{
      id: string;
      parentSession: { id: string } | null;
      specialistId: string | null;
    }>;

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${rootSessionId}/history`,
    });
    const history = historyResponse.json().history as Array<{
      emittedAt: string;
      eventId: string;
      update: {
        eventType: string;
      };
    }>;
    const planEvent = history.find(
      (event) => event.update.eventType === 'plan_update',
    );

    if (!planEvent) {
      throw new Error('Expected the root session plan event to be recorded');
    }

    expect(tasksResponse.statusCode).toBe(200);
    expect(syncedTasks).toEqual([]);
    expect(sessionsResponse.statusCode).toBe(200);
    expect(sessions).toHaveLength(1);
    expect(historyResponse.statusCode).toBe(200);
    expect(history.map((event) => event.update.eventType)).toEqual(
      expect.arrayContaining(['plan_update']),
    );
    expect(createRuntimeSession).toHaveBeenCalledTimes(1);
    expect(promptRuntimeSession).not.toHaveBeenCalled();
  });

  it('lists ACP providers from agent-gateway', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-provider-gateway-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => false),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);
    fastify.decorate('agentGatewayClient', {
      cancel: vi.fn(),
      createSession: vi.fn(),
      installProvider: vi.fn(async () => ({
        command: 'npx -y @example/codex-acp',
        distributionType: 'npx',
        installedAt: '2026-03-13T00:00:00.000Z',
        providerId: 'codex',
        success: true,
      })),
      isConfigured: vi.fn(() => true),
      isProviderConfigured: vi.fn(() => true),
      listEvents: vi.fn(),
      listProviders: vi.fn(async () => ({
        providers: [
          {
            id: 'codex',
            name: 'Codex',
            description: 'OpenAI Codex CLI (via codex app-server)',
            command: 'codex',
            distributionTypes: [],
            envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
            installable: false,
            installed: false,
            source: 'static',
            status: 'available',
            unavailableReason: null,
          },
        ],
        registry: {
          error: null,
          fetchedAt: null,
          url: 'https://example.test/registry.json',
        },
      })),
      prompt: vi.fn(),
      refreshProviderCatalog: vi.fn(),
      stream: vi.fn(),
    });

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/acp/providers?registry=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      _links: {
        self: {
          href: '/api/acp/providers{?registry}',
          templated: true,
        },
        install: {
          href: '/api/acp/install',
        },
      },
      registry: {
        url: 'https://example.test/registry.json',
      },
      _embedded: {
        providers: [
          expect.objectContaining({
            id: 'codex',
            envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
          }),
        ],
      },
    });
  });

  it('returns an error when agent-gateway provider metadata is unavailable', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-provider-unavailable-${Date.now()}`;
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => false),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);
    fastify.decorate('agentGatewayClient', {
      cancel: vi.fn(),
      createSession: vi.fn(),
      installProvider: vi.fn(async () => {
        throw new ProblemError({
          type: 'https://team-ai.dev/problems/agent-gateway-unavailable',
          title: 'Agent Gateway Unavailable',
          status: 503,
          detail: 'sidecar is down',
        });
      }),
      isConfigured: vi.fn(() => true),
      isProviderConfigured: vi.fn(() => false),
      listEvents: vi.fn(),
      listProviders: vi.fn(async () => {
        throw new ProblemError({
          type: 'https://team-ai.dev/problems/agent-gateway-unavailable',
          title: 'Agent Gateway Unavailable',
          status: 503,
          detail: 'sidecar is down',
        });
      }),
      prompt: vi.fn(),
      refreshProviderCatalog: vi.fn(),
      stream: vi.fn(),
    });

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/acp/providers?registry=true',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      title: 'Agent Gateway Unavailable',
      detail: 'sidecar is down',
    });
  });

  it('rejects session/new requests that still pass specialistId on the public ACP route', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-specialistid-test-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => false),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-specialist',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: 'project-1',
          specialistId: 'solo-developer',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jsonrpc: '2.0',
      id: 'req-specialist',
      result: null,
      error: {
        code: -32602,
        message:
          'session/new no longer accepts specialistId; pass role instead',
      },
    });
  });

  it('rejects session/new requests that still pass mode on the public ACP route', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-mode-test-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => false),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-mode',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: 'project-1',
          mode: 'CHAT',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jsonrpc: '2.0',
      id: 'req-mode',
      result: null,
      error: {
        code: -32602,
        message: 'session/new no longer accepts mode; choose role instead',
      },
    });
  });

  it('rejects session/new requests that still pass taskId on the public ACP route', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-taskid-test-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => false),
      loadSession: vi.fn(),
      promptSession: vi.fn(),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-taskid',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: 'project-1',
          taskId: 'task-1',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jsonrpc: '2.0',
      id: 'req-taskid',
      result: null,
      error: {
        code: -32602,
        message:
          'session/new no longer accepts taskId; execute the task explicitly instead',
      },
    });
  });

  async function createFullAcpServer(runtime: AcpRuntimeClient) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', runtime);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(meRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(agentsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  async function createTaskBoundSessionFixture(
    fastify: ReturnType<typeof Fastify>,
    projectTitle: string,
  ) {
    const project = await createProject(fastify.sqlite, {
      title: projectTitle,
      repoPath: `/tmp/${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    });

    const rootResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: `${project.id}-root-session`,
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          role: 'ROUTA',
        },
      },
    });

    expect(rootResponse.statusCode).toBe(200);
    const rootSessionId = rootResponse.json().result.session.id as string;

    const task = await createTask(fastify.sqlite, {
      objective: 'Implement the routed task',
      projectId: project.id,
      title: 'Implement routed task',
      sessionId: rootSessionId,
      assignedRole: 'CRAFTER',
      status: 'READY',
    });

    const childSession = await createAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
        parentSessionId: rootSessionId,
        role: 'CRAFTER',
        taskId: task.id,
      },
      {
        logger: fastify.log,
        source: 'acp-route-test',
      },
    );
    const childSessionId = childSession.id;

    return {
      childSessionId,
      project,
      rootSessionId,
      task,
    };
  }
});
