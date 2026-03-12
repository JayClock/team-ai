import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { createProject } from '../services/project-service';
import { createTask, getTaskById } from '../services/task-service';
import acpRoute from './acp';
import agentsRoute from './agents';
import meRoute from './me';
import projectsRoute from './projects';
import rootRoute from './root';

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
    expect(promptMock).toHaveBeenCalledWith({
      localSessionId: sessionId,
      prompt:
        'System:\nHandle planning, implementation, and verification in one pass when the workflow\n' +
        'does not need multi-agent decomposition.\n\nStay in the current ACP session and complete the task directly unless the user\n' +
        'explicitly asks for decomposition or a downstream specialist is strictly\n' +
        'required.\n\nUser:\nhello desktop acp',
      timeoutMs: undefined,
      eventId: undefined,
      traceId: undefined,
    });

    const sessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });

    expect(sessionsResponse.statusCode).toBe(200);
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
    expect(
      historyResponse
        .json()
        .history.map((event: { type: string }) => event.type),
    ).toEqual(
      expect.arrayContaining(['session', 'message', 'status', 'complete']),
    );

    const rootResponse = await fastify.inject({
      method: 'GET',
      url: '/api',
    });
    expect(rootResponse.json()._links.me.href).toBe('/api/me');
    expect(rootResponse.json()._links.acp.href).toBe('/api/acp');
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
      triggerSessionId: rootSessionId,
      assignedRole: 'CRAFTER',
      status: 'READY',
    });

    const childResponse = await fastify.inject({
      method: 'POST',
      url: '/api/acp',
      payload: {
        jsonrpc: '2.0',
        id: 'child-session',
        method: 'session/new',
        params: {
          actorUserId: 'desktop-user',
          projectId: project.id,
          provider: 'codex',
          parentSessionId: rootSessionId,
          role: 'CRAFTER',
          taskId: task.id,
        },
      },
    });

    expect(childResponse.statusCode).toBe(200);
    const childSessionId = childResponse.json().result.session.id as string;

    const childSession = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${childSessionId}`,
    });

    expect(childSession.json()).toMatchObject({
      parentSession: { id: rootSessionId },
      specialistId: 'crafter-implementor',
      task: { id: task.id },
    });

    const updatedTask = await getTaskById(fastify.sqlite, task.id);
    expect(updatedTask).toMatchObject({
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
  });

  it('lists ACP providers with merged local and registry discovery metadata', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-provider-test-${Date.now()}`;
    process.env.TEAMAI_ACP_CODEX_COMMAND = 'node --version';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 'test',
          agents: [
            {
              id: 'codex',
              name: 'Codex Registry',
              description: 'Registry provider',
              distribution: {
                npx: {
                  package: '@example/codex-acp',
                },
              },
            },
            {
              id: 'custom-registry',
              name: 'Custom Registry',
              description: 'Registry only provider',
              distribution: {
                npx: {
                  package: '@example/custom-acp',
                },
              },
            },
          ],
        }),
      })),
    );

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
        error: null,
      },
    });

    expect(response.json()._embedded.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'codex',
          status: 'available',
          source: 'hybrid',
          envCommandKey: 'TEAMAI_ACP_CODEX_COMMAND',
        }),
        expect.objectContaining({
          id: 'custom-registry',
          source: 'registry',
          installable: true,
        }),
      ]),
    );
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
});
