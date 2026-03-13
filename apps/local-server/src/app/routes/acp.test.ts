import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AcpRuntimeClient,
  AcpRuntimeSessionHooks,
} from '../clients/acp-runtime-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { syncPlanEventToTasksAndDispatch } from '../services/acp-plan-task-sync-service';
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
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: task.id,
    });

    expect(updatedTask).toMatchObject({
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        kind: 'implement',
        provider: 'codex',
        role: 'CRAFTER',
        sessionId: childSessionId,
        specialistId: 'crafter-implementor',
        status: 'RUNNING',
        taskId: task.id,
      }),
    ]);
  });

  it('syncs top-level ROUTA plan events into project tasks and child sessions', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-acp-plan-sync-${Date.now()}`;
    process.env.DESKTOP_SESSION_TOKEN = 'desktop-token-test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4312';

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const sessionHooks = new Map<string, AcpRuntimeSessionHooks>();
    let dispatchedChildSessionId: string | null = null;
    let executionStateDuringDispatch: {
      executionSessionId: string | null;
      status: string;
      taskId: string;
    } | null = null;

    const createRuntimeSession = vi.fn(async (input) => {
      sessionHooks.set(input.localSessionId, input.hooks);

      return {
        runtimeSessionId: `runtime-${input.localSessionId}`,
        provider: input.provider,
      };
    });
    const promptRuntimeSession = vi.fn(async (input) => {
      const taskRow = fastify.sqlite
        .prepare(
          `
            SELECT id, execution_session_id, status
            FROM project_tasks
            WHERE execution_session_id = ? AND deleted_at IS NULL
          `,
        )
        .get(input.localSessionId) as
        | {
            id: string;
            execution_session_id: string | null;
            status: string;
          }
        | undefined;

      if (taskRow) {
        dispatchedChildSessionId = input.localSessionId;
        executionStateDuringDispatch = {
          taskId: taskRow.id,
          executionSessionId: taskRow.execution_session_id,
          status: taskRow.status,
        };
      }

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
      update: {
        entries: planEntries,
        sessionUpdate: 'plan',
      },
    } as Parameters<AcpRuntimeSessionHooks['onSessionUpdate']>[0]);

    const tasksResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/tasks`,
    });
    const syncedTasks = tasksResponse.json()._embedded.tasks as Array<{
      assignedRole: string;
      executionSessionId: string | null;
      id: string;
      kind: string | null;
      resultSessionId: string | null;
      status: string;
      title: string;
      triggerSessionId: string | null;
    }>;
    const implementTask = syncedTasks.find(
      (task) => task.title === 'Implement automatic ACP task sync',
    );
    const verifyTask = syncedTasks.find(
      (task) => task.title === 'Verify workbench reflects synced tasks',
    );

    if (!implementTask) {
      throw new Error('Expected the synced implement task to exist');
    }
    if (!verifyTask) {
      throw new Error('Expected the synced verify task to exist');
    }

    const updatedTask = await getTaskById(fastify.sqlite, implementTask.id);
    const taskRuns = await listTaskRuns(fastify.sqlite, {
      page: 1,
      pageSize: 10,
      projectId: project.id,
      taskId: implementTask.id,
    });

    const sessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });
    const sessions = sessionsResponse.json()._embedded.sessions as Array<{
      id: string;
      parentSession: { id: string } | null;
      specialistId: string | null;
      state: string;
      task: { id: string } | null;
    }>;
    const childSession = sessions.find(
      (session) => session.task?.id === implementTask.id,
    );

    if (!childSession) {
      throw new Error('Expected the auto-dispatched child session to exist');
    }

    const historyResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${rootSessionId}/history`,
    });
    const history = historyResponse.json().history as Array<{
      emittedAt: string;
      eventId: string;
      type: string;
    }>;
    const planEvent = history.find((event) => event.type === 'plan');

    if (!planEvent) {
      throw new Error('Expected the root session plan event to be recorded');
    }

    const replayCreateSession = vi.fn(async () => ({
      id: 'acps_should_not_exist',
    }));
    const replayPromptSession = vi.fn(async () => undefined);

    const replayResult = await syncPlanEventToTasksAndDispatch(
      fastify.sqlite,
      {
        createSession: replayCreateSession,
        promptSession: replayPromptSession,
      },
      {
        emittedAt: planEvent.emittedAt,
        entries: planEntries,
        eventId: planEvent.eventId,
        sessionId: rootSessionId,
      },
    );

    const sessionsAfterReplayResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions`,
    });

    expect(tasksResponse.statusCode).toBe(200);
    expect(implementTask).toMatchObject({
      assignedRole: 'CRAFTER',
      kind: 'implement',
      resultSessionId: childSession.id,
      status: 'COMPLETED',
      title: 'Implement automatic ACP task sync',
      triggerSessionId: rootSessionId,
    });
    expect(verifyTask).toMatchObject({
      assignedRole: 'GATE',
      executionSessionId: null,
      kind: 'verify',
      resultSessionId: null,
      status: 'COMPLETED',
      title: 'Verify workbench reflects synced tasks',
      triggerSessionId: rootSessionId,
    });
    expect(executionStateDuringDispatch).toEqual({
      executionSessionId: childSession.id,
      status: 'RUNNING',
      taskId: implementTask.id,
    });
    expect(updatedTask).toMatchObject({
      executionSessionId: null,
      status: 'COMPLETED',
      resultSessionId: childSession.id,
      triggerSessionId: rootSessionId,
    });
    expect(taskRuns.items).toEqual([
      expect.objectContaining({
        kind: 'implement',
        provider: 'codex',
        role: 'CRAFTER',
        sessionId: childSession.id,
        specialistId: 'crafter-implementor',
        status: 'RUNNING',
        taskId: implementTask.id,
      }),
    ]);
    expect(sessionsResponse.statusCode).toBe(200);
    expect(sessions).toHaveLength(2);
    expect(childSession).toMatchObject({
      id: dispatchedChildSessionId,
      parentSession: { id: rootSessionId },
      specialistId: 'crafter-implementor',
      state: 'COMPLETED',
      task: { id: implementTask.id },
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(history.map((event) => event.type)).toEqual(
      expect.arrayContaining(['plan', 'status']),
    );
    expect(replayResult).toEqual({
      createdCount: 0,
      skipped: false,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: true,
        results: [],
        skippedReason: 'NO_NEW_TASKS',
      },
    });
    expect(replayCreateSession).not.toHaveBeenCalled();
    expect(replayPromptSession).not.toHaveBeenCalled();
    expect(sessionsAfterReplayResponse.statusCode).toBe(200);
    expect(sessionsAfterReplayResponse.json()._embedded.sessions).toHaveLength(
      2,
    );
    expect(createRuntimeSession).toHaveBeenCalledTimes(2);
    expect(promptRuntimeSession).toHaveBeenCalledTimes(1);
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
