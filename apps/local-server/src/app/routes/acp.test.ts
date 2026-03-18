import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
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
import {
  createAcpSession,
  DEFAULT_ACP_PROMPT_TIMEOUT_MS,
  getAcpSessionById,
  listAcpSessionHistory,
} from '../services/acp-service';
import {
  getProjectWorktreeById,
  createProjectWorktree,
} from '../services/project-worktree-service';
import { listProjectCodebases } from '../services/project-codebase-service';
import { updateProjectRuntimeProfile } from '../services/project-runtime-profile-service';
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

const execFileAsync = promisify(execFile);

describe('acp route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const tempRepoPaths: string[] = [];
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

    while (tempRepoPaths.length > 0) {
      const repoPath = tempRepoPaths.pop();
      if (repoPath) {
        await rm(repoPath, { recursive: true, force: true });
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
      killSession: vi.fn(async () => undefined),
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
    expect(promptResponse.json()).toMatchObject({
      id: 'req-2',
      jsonrpc: '2.0',
      error: null,
      result: {
        session: {
          acpStatus: 'running',
          id: sessionId,
        },
        runtime: null,
      },
    });
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(promptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        localSessionId: sessionId,
        timeoutMs: DEFAULT_ACP_PROMPT_TIMEOUT_MS,
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
      expect.arrayContaining([
        'user_message',
        'turn_complete',
        'lifecycle_update',
      ]),
    );

    const rootResponse = await fastify.inject({
      method: 'GET',
      url: '/api',
    });
    expect(rootResponse.json()._links.me.href).toBe('/api/me');
    expect(rootResponse.json()._links.acp.href).toBe('/api/acp');
  });

  it('cleans up ACP SSE subscribers when the client aborts the stream', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-sse-cleanup-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-1',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP SSE Cleanup Project',
      repoPath: '/tmp/team-ai-desktop-sse-cleanup',
    });
    const session = await createAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
        role: 'DEVELOPER',
      },
      {
        logger: fastify.log,
        source: 'acp-route-test',
      },
    );

    const baseUrl = await fastify.listen({
      host: '127.0.0.1',
      port: 0,
    });
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/acp?sessionId=${session.id}`, {
      signal: controller.signal,
    });

    expect(response.ok).toBe(true);
    await vi.waitFor(() => {
      expect(fastify.acpStreamBroker.countSubscribers(session.id)).toBe(1);
    });

    controller.abort();
    await response.body?.cancel().catch(() => undefined);

    await vi.waitFor(() => {
      expect(fastify.acpStreamBroker.countSubscribers(session.id)).toBe(0);
    });
  });

  it('lists active ACP runtime sessions from the unified inventory view', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-runtime-inventory-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    let createdSessionId: string | null = null;
    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      listSessions: vi.fn(() =>
        createdSessionId
          ? [
              {
                cwd: '/tmp/team-ai-runtime-inventory',
                isBusy: false,
                lastTouchedAt: '2026-03-18T00:00:00.000Z',
                localSessionId: createdSessionId,
                provider: 'codex',
                runtimeSessionId: `runtime-${createdSessionId}`,
              },
            ]
          : [],
      ),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-1',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Runtime Inventory Project',
      repoPath: '/tmp/team-ai-runtime-inventory',
    });
    const session = await createAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      {
        actorUserId: 'desktop-user',
        projectId: project.id,
        provider: 'codex',
        role: 'DEVELOPER',
      },
      {
        logger: fastify.log,
        source: 'acp-route-test',
      },
    );
    createdSessionId = session.id;

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/acp/runtime-sessions',
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(
      VENDOR_MEDIA_TYPES.acpRuntimeSessions,
    );
    expect(response.json()).toMatchObject({
      total: 1,
      _embedded: {
        runtimeSessions: [
          {
            cwd: '/tmp/team-ai-runtime-inventory',
            isBusy: false,
            lastTouchedAt: '2026-03-18T00:00:00.000Z',
            localSessionId: createdSessionId,
            provider: 'codex',
            runtimeSessionId: `runtime-${createdSessionId}`,
            streamSubscriberCount: 0,
            session: {
              id: createdSessionId,
              project: {
                id: project.id,
              },
            },
          },
        ],
      },
    });
  });

  it('persists runtime updates against the local session when providers emit remote session ids', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-remote-session-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const sessionHooks = new Map<string, AcpRuntimeSessionHooks>();
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
      killSession: vi.fn(async () => undefined),
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
            content: 'Remote session id update',
            contentBlock: {
              type: 'text',
              text: 'Remote session id update',
            },
            isChunk: true,
            messageId: 'assistant-msg-remote',
            role: 'assistant',
          },
          provider: input.provider,
          rawNotification: {
            update: {
              sessionUpdate: 'agent_message_chunk',
              messageId: 'assistant-msg-remote',
              content: {
                type: 'text',
                text: 'Remote session id update',
              },
            },
          },
          sessionId: `runtime-${input.localSessionId}`,
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

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Remote Session Project',
      repoPath: '/tmp/team-ai-desktop-remote-session-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-remote-session-create',
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
    const sessionId = createResponse.json().result.session.id as string;

    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-remote-session-prompt',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId,
          prompt: 'hello remote session',
        },
      },
    });

    expect(promptResponse.statusCode).toBe(200);

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json().history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId,
          update: expect.objectContaining({
            eventType: 'agent_message',
            sessionId,
          }),
        }),
      ]),
    );
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
      killSession: vi.fn(async () => undefined),
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
    expect(storedSession.model).toBeNull();
  });

  it('persists and returns the requested session model', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-model-test-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Model Project',
      repoPath: '/tmp/team-ai-desktop-model-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-model',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          model: 'gpt-5',
          projectId: project.id,
          provider: 'codex',
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);

    const sessionId = createResponse.json().result.session.id as string;
    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.model).toBe('gpt-5');

    const sessionResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}`,
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      id: sessionId,
      model: 'gpt-5',
      provider: 'codex',
    });

    const collectionResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });

    expect(collectionResponse.statusCode).toBe(200);
    expect(collectionResponse.json()._embedded.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId,
          model: 'gpt-5',
          provider: 'codex',
        }),
      ]),
    );
  });

  it('recreates the runtime and replays session history when patching the session model', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-model-reload-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const activeSessions = new Set<string>();
    const sessionHooks = new Map<string, AcpRuntimeSessionHooks>();
    const createSessionMock = vi.fn(async (input) => {
      activeSessions.add(input.localSessionId);
      sessionHooks.set(input.localSessionId, input.hooks);
      return {
        runtimeSessionId: `runtime-${input.localSessionId}-${createSessionMock.mock.calls.length + 1}`,
        provider: input.provider,
      };
    });
    const killSessionMock = vi.fn(async (localSessionId: string) => {
      activeSessions.delete(localSessionId);
    });
    const promptSessionMock = vi.fn(async (input) => {
      const hooks = sessionHooks.get(input.localSessionId);

      if (!input.prompt.includes('reply with exactly: ACK')) {
        await hooks?.onSessionUpdate({
          eventType: 'agent_message',
          message: {
            content: 'assistant reply',
            contentBlock: {
              type: 'text',
              text: 'assistant reply',
            },
            isChunk: false,
            messageId: 'assistant-msg-1',
            role: 'assistant',
          },
          provider: input.provider,
          rawNotification: {
            update: {
              content: {
                type: 'text',
                text: 'assistant reply',
              },
              messageId: 'assistant-msg-1',
              sessionUpdate: 'agent_message',
            },
          },
          sessionId: input.localSessionId,
          timestamp: '2026-03-18T00:00:00.000Z',
        } as Parameters<AcpRuntimeSessionHooks['onSessionUpdate']>[0]);
      }

      return {
        runtimeSessionId: `runtime-${input.localSessionId}-${createSessionMock.mock.calls.length}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      };
    });

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: createSessionMock,
      killSession: killSessionMock,
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn((localSessionId: string) =>
        activeSessions.has(localSessionId),
      ),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: promptSessionMock,
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Model Reload Project',
      repoPath: '/tmp/team-ai-desktop-model-reload-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-model-reload-create',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          model: 'gpt-5',
          projectId: project.id,
          provider: 'codex',
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const sessionId = createResponse.json().result.session.id as string;
    const promptResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-model-reload-prompt',
        method: 'session/prompt',
        params: {
          projectId: project.id,
          sessionId,
          prompt: 'hello existing context',
        },
      },
    });

    expect(promptResponse.statusCode).toBe(200);

    const updateResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}`,
      payload: {
        model: 'gpt-5.4',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: sessionId,
      model: 'gpt-5.4',
      provider: 'codex',
    });
    expect(killSessionMock).toHaveBeenCalledWith(sessionId);
    expect(createSessionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        localSessionId: sessionId,
        model: 'gpt-5.4',
        provider: 'codex',
      }),
    );
    expect(promptSessionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        localSessionId: sessionId,
        provider: 'codex',
      }),
    );
    const replayPrompt = (
      promptSessionMock.mock.calls[1]?.[0] as { prompt: string } | undefined
    )?.prompt;
    expect(replayPrompt).toContain('Conversation history:');
    expect(replayPrompt).toContain('User:\nhello existing context');
    expect(replayPrompt).toContain('Assistant:\nassistant reply');
    expect(replayPrompt).toContain('reply with exactly: ACK');

    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.model).toBe('gpt-5.4');

    const agentsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents`,
    });

    expect(agentsResponse.statusCode).toBe(200);
    expect(agentsResponse.json()._embedded.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'gpt-5.4',
          provider: 'codex',
          specialistId: 'solo-developer',
        }),
      ]),
    );
  });

  it('recreates the runtime and clears the explicit model when patching the session provider', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-provider-reload-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const activeSessions = new Set<string>();
    const createSessionMock = vi.fn(async (input) => {
      activeSessions.add(input.localSessionId);
      return {
        runtimeSessionId: `runtime-${input.localSessionId}-${createSessionMock.mock.calls.length + 1}`,
        provider: input.provider,
      };
    });
    const killSessionMock = vi.fn(async (localSessionId: string) => {
      activeSessions.delete(localSessionId);
    });

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: createSessionMock,
      killSession: killSessionMock,
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn((localSessionId: string) =>
        activeSessions.has(localSessionId),
      ),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}-${createSessionMock.mock.calls.length}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Provider Reload Project',
      repoPath: '/tmp/team-ai-desktop-provider-reload-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-provider-reload-create',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          model: 'gpt-5',
          projectId: project.id,
          provider: 'codex',
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const sessionId = createResponse.json().result.session.id as string;

    const updateResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}`,
      payload: {
        provider: 'opencode',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: sessionId,
      model: null,
      provider: 'opencode',
    });
    expect(killSessionMock).toHaveBeenCalledWith(sessionId);
    expect(createSessionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        localSessionId: sessionId,
        model: null,
        provider: 'opencode',
      }),
    );

    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.model).toBeNull();
    expect(storedSession.provider).toBe('opencode');
  });

  it('resolves provider and model from the project runtime profile when session/new omits them', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-profile-defaults-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Runtime Profile Defaults',
      repoPath: '/tmp/team-ai-desktop-runtime-profile-defaults',
    });

    await updateProjectRuntimeProfile(
      fastify.sqlite,
      project.id,
      {
        roleDefaults: {
          DEVELOPER: {
            model: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
        },
      },
      {
        listProviderModels: async () => [
          {
            id: 'openai/gpt-5-mini',
            providerId: 'opencode',
          },
        ],
      },
    );

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-runtime-profile-defaults',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(fastify.acpRuntime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5-mini',
        provider: 'opencode',
      }),
    );

    const sessionId = createResponse.json().result.session.id as string;
    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.provider).toBe('opencode');
    expect(storedSession.model).toBe('openai/gpt-5-mini');

    const agentsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents`,
    });

    expect(agentsResponse.statusCode).toBe(200);
    expect(agentsResponse.json()._embedded.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'openai/gpt-5-mini',
          specialistId: 'solo-developer',
        }),
      ]),
    );
  });

  it('defaults role-less root sessions to the routa coordinator in multi-agent mode', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-default-routa-role-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Default Routa Role',
      repoPath: '/tmp/team-ai-desktop-default-routa-role',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-default-routa-role',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const sessionId = createResponse.json().result.session.id as string;
    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.specialistId).toBe('routa-coordinator');

    const agentsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/agents`,
    });

    expect(agentsResponse.statusCode).toBe(200);
    expect(agentsResponse.json()._embedded.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Routa Coordinator',
          role: 'ROUTA',
          specialistId: 'routa-coordinator',
        }),
      ]),
    );
  });

  it('defaults role-less root sessions to solo developer when the runtime profile selects DEVELOPER mode', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-default-developer-role-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Default Developer Role',
      repoPath: '/tmp/team-ai-desktop-default-developer-role',
    });

    await updateProjectRuntimeProfile(fastify.sqlite, project.id, {
      orchestrationMode: 'DEVELOPER',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-default-developer-role',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const sessionId = createResponse.json().result.session.id as string;
    const storedSession = await getAcpSessionById(fastify.sqlite, sessionId);
    expect(storedSession.specialistId).toBe('solo-developer');

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
          specialistId: 'solo-developer',
        }),
      ]),
    );
  });

  it('fails explicitly when neither an input provider nor a runtime profile default provider exists', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-provider-missing-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4310';

    const fastify = await createFullAcpServer({
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    const project = await createProject(fastify.sqlite, {
      title: 'Desktop ACP Missing Provider',
      repoPath: '/tmp/team-ai-desktop-missing-provider',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'req-provider-missing',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          role: 'DEVELOPER',
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      error: {
        message:
          `Project ${project.id} does not have a provider for ACP session creation. ` +
          'Set a role-based provider in project settings or pass provider explicitly.',
      },
      result: null,
    });
    expect(fastify.acpRuntime.createSession).not.toHaveBeenCalled();
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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

  it('binds ACP sessions to worktrees and resolves cwd from the worktree path', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-worktree-cwd-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4316';

    const runtime = {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      })),
      killSession: vi.fn(async () => undefined),
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
    } satisfies AcpRuntimeClient;
    const fastify = await createFullAcpServer(runtime);
    const repoPath = await createGitRepository();
    const project = await createProject(fastify.sqlite, {
      title: 'ACP Worktree Session Project',
      repoPath,
    });
    const [codebase] = (await listProjectCodebases(fastify.sqlite, project.id))
      .items;
    const worktree = await createProjectWorktree(
      fastify.sqlite,
      project.id,
      codebase.id,
      {
        label: 'Session Workspace',
      },
    );

    const session = await createAcpSession(
      fastify.sqlite,
      fastify.acpStreamBroker,
      fastify.acpRuntime,
      {
        actorUserId: 'desktop-user',
        codebaseId: codebase.id,
        cwd: '/tmp/ignored-cwd',
        projectId: project.id,
        provider: 'codex',
        worktreeId: worktree.id,
      },
      {
        logger: fastify.log,
        source: 'acp-route-test-worktree-cwd',
      },
    );
    const persistedWorktree = await getProjectWorktreeById(
      fastify.sqlite,
      project.id,
      worktree.id,
    );

    expect(session).toMatchObject({
      codebase: { id: codebase.id },
      cwd: worktree.worktreePath,
      worktree: { id: worktree.id },
    });
    expect(runtime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: worktree.worktreePath,
        localSessionId: session.id,
      }),
    );
    expect(persistedWorktree.sessionId).toBe(session.id);
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
      killSession: vi.fn(async () => undefined),
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
    const successHistory = await listAcpSessionHistory(
      fastify.sqlite,
      project.id,
      childSessionId,
      200,
    );
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
    expect(successHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            eventType: 'lifecycle_update',
            lifecycle: expect.objectContaining({
              state: 'completed',
              taskBound: true,
            }),
          }),
        }),
      ]),
    );
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
      killSession: vi.fn(async () => undefined),
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
    const failedHistory = await listAcpSessionHistory(
      fastify.sqlite,
      project.id,
      childSessionId,
      200,
    );
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
    expect(failedHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            eventType: 'lifecycle_update',
            lifecycle: expect.objectContaining({
              state: 'failed',
              taskBound: true,
            }),
          }),
        }),
      ]),
    );
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
      killSession: vi.fn(async () => undefined),
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
    const timeoutHistory = await listAcpSessionHistory(
      fastify.sqlite,
      project.id,
      childSessionId,
      200,
    );
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
    expect(timeoutHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            eventType: 'lifecycle_update',
            lifecycle: expect.objectContaining({
              state: 'timeout',
              taskBound: true,
            }),
          }),
        }),
      ]),
    );
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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
      killSession: vi.fn(async () => undefined),
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

  async function createGitRepository() {
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-acp-worktree-repo-'),
    );
    tempRepoPaths.push(repoPath);

    await mkdir(repoPath, { recursive: true });
    await execFileAsync('git', ['init', '--initial-branch=main'], {
      cwd: repoPath,
    });
    await execFileAsync('git', ['config', 'user.name', 'Team AI Test'], {
      cwd: repoPath,
    });
    await execFileAsync(
      'git',
      ['config', 'user.email', 'team-ai@example.test'],
      {
        cwd: repoPath,
      },
    );
    await writeFile(join(repoPath, 'README.md'), '# test\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoPath });

    return repoPath;
  }
});
