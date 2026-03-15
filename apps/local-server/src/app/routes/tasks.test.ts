import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import '../plugins/acp-runtime';
import acpStreamPlugin from '../plugins/acp-stream';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import { responseContentType } from '../test-support/response-content-type';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import tasksRoute from './tasks';

describe('tasks routes', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates tasks through the project task collection and filters listings by sessionId', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Desktop Project',
      repoPath: '/tmp/team-ai-task-project',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Root session');

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: {
        acceptanceCriteria: ['Task list available'],
        labels: ['backend'],
        objective: 'Add task listing',
        priority: 'high',
        sessionId,
        status: 'READY',
        title: 'Implement task routes',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(createResponse.headers.location).toMatch(/^\/api\/tasks\/task_/);

    const task = createResponse.json() as { id: string };
    expect(task).toMatchObject({
      objective: 'Add task listing',
      projectId: project.id,
      title: 'Implement task routes',
    });

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(responseContentType(detailResponse)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(detailResponse.json()).toMatchObject({
      id: task.id,
      _links: {
        execute: {
          href: `/api/tasks/${task.id}/execute`,
        },
        collection: {
          href: `/api/projects/${project.id}/tasks`,
        },
      },
    });

    const sessionTasksResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/tasks?sessionId=${sessionId}`,
    });

    expect(sessionTasksResponse.statusCode).toBe(200);
    expect(responseContentType(sessionTasksResponse)).toBe(
      VENDOR_MEDIA_TYPES.tasks,
    );
    expect(sessionTasksResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        tasks: [expect.objectContaining({ id: task.id })],
      },
    });

    const projectTasksResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/tasks`,
    });

    expect(projectTasksResponse.statusCode).toBe(200);
    expect(responseContentType(projectTasksResponse)).toBe(
      VENDOR_MEDIA_TYPES.tasks,
    );
    expect(projectTasksResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        tasks: [expect.objectContaining({ id: task.id })],
      },
    });
  });

  it('updates and deletes tasks through task detail routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Controls',
      repoPath: '/tmp/team-ai-task-controls',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Task session');
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Initial objective',
      title: 'Initial task',
    });

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        assignedRole: 'CRAFTER',
        status: 'RUNNING',
        verificationVerdict: 'pending',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(responseContentType(patchResponse)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(patchResponse.json()).toMatchObject({
      assignedRole: 'CRAFTER',
      id: taskId,
      status: 'RUNNING',
      verificationVerdict: 'pending',
    });

    const deleteResponse = await fastify.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
    });

    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toMatchObject({
      title: 'Task Not Found',
      type: 'https://team-ai.dev/problems/task-not-found',
    });
  });

  it('updates task status without dispatching on patch', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Dispatch Route',
      repoPath: '/tmp/team-ai-task-dispatch-route',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Dispatch session');
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Dispatch after a manual retry',
      title: 'Retry-ready task',
    });

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        status: 'READY',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(responseContentType(patchResponse)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(patchResponse.json()).toMatchObject({
      id: taskId,
      status: 'READY',
    });
    expect(fastify.acpRuntime.createSession).not.toHaveBeenCalled();
    expect(fastify.acpRuntime.promptSession).not.toHaveBeenCalled();
  });

  it('executes a task through the explicit task action route', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Execute Route',
      repoPath: '/tmp/team-ai-task-execute-route',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Execute session');
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Kick off execution from the task card',
      title: 'Actionable task',
    });

    const executeResponse = await fastify.inject({
      method: 'POST',
      payload: {
        sessionId,
      },
      url: `/api/tasks/${taskId}/execute`,
    });

    expect(executeResponse.statusCode).toBe(200);
    expect(responseContentType(executeResponse)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(executeResponse.json()).toMatchObject({
      assignedProvider: 'codex',
      assignedRole: 'CRAFTER',
      assignedSpecialistId: 'crafter-implementor',
      id: taskId,
      resultSessionId: expect.stringMatching(/^acps_/),
      status: 'COMPLETED',
      triggerSessionId: expect.stringMatching(/^acps_/),
    });
    expect(fastify.acpRuntime.createSession).toHaveBeenCalledTimes(1);
    expect(fastify.acpRuntime.promptSession).toHaveBeenCalledWith(
      expect.objectContaining({
        localSessionId: expect.any(String),
        prompt: expect.stringContaining('Task: Actionable task'),
      }),
    );
  });

  it('rejects empty task patches, missing trigger sessions, and removed session-scoped task routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Errors',
      repoPath: '/tmp/team-ai-task-errors',
    });
    const sessionId = createAcpSession(
      sqlite,
      project.id,
      'Task error session',
    );
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Initial objective',
      title: 'Initial task',
    });

    const emptyPatchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {},
    });

    expect(emptyPatchResponse.statusCode).toBe(400);

    const missingSessionResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: {
        objective: 'Should fail',
        sessionId: 'acps_missing',
        title: 'Missing session task',
      },
    });

    expect(missingSessionResponse.statusCode).toBe(404);
    expect(missingSessionResponse.json()).toMatchObject({
      title: 'ACP Session Not Found',
      type: 'https://team-ai.dev/problems/acp-session-not-found',
    });

    const removedSessionRouteResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/acp-sessions/${sessionId}/tasks`,
    });

    expect(removedSessionRouteResponse.statusCode).toBe(404);
  });

  it('resolves assigned specialists from workspace directories', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-task-route-specialist-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'frontend-crafter.md'),
      [
        '---',
        'id: frontend-crafter',
        'name: Frontend Crafter',
        'role: CRAFTER',
        'description: Implements frontend changes.',
        '---',
        'Focus on frontend implementation details.',
      ].join('\n'),
      'utf8',
    );
    const project = await createProject(sqlite, {
      title: 'Specialist Project',
      repoPath,
    });
    const sessionId = createAcpSession(
      sqlite,
      project.id,
      'Specialist task session',
    );

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: {
        assignedSpecialistId: 'frontend-crafter',
        objective: 'Use specialist',
        sessionId,
        title: 'Specialist-backed task',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assignedRole: 'CRAFTER',
      assignedSpecialistId: 'frontend-crafter',
      assignedSpecialistName: 'Frontend Crafter',
    });
  });

  it('rejects invalid task roles', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Invalid Role Project',
      repoPath: '/tmp/team-ai-task-invalid-role',
    });
    const sessionId = createAcpSession(
      sqlite,
      project.id,
      'Invalid role session',
    );

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: {
        assignedRole: 'planner',
        objective: 'Reject invalid role',
        sessionId,
        title: 'Invalid role task',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      title: 'Invalid Role',
      type: 'https://team-ai.dev/problems/invalid-role',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-tasks-route-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }

  async function createTestServer(sqlite: Database) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        provider: input.provider,
        runtimeSessionId: 'runtime-1',
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        provider: input.provider,
        runtimeSessionId: input.runtimeSessionId,
      })),
      promptSession: vi.fn(async () => ({
        response: {
          stopReason: 'end_turn' as const,
        },
        runtimeSessionId: 'runtime-1',
      })),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  function createAcpSession(
    sqlite: Database,
    projectId: string,
    title: string,
  ) {
    const sessionId = `acps_${Math.random().toString(36).slice(2, 10)}`;
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-project',
      id: sessionId,
      name: title,
      projectId,
    });
    return sessionId;
  }

  async function createTask(
    fastify: ReturnType<typeof Fastify>,
    projectId: string,
    sessionId: string,
    payload: {
      objective: string;
      title: string;
    },
  ) {
    const response = await fastify.inject({
      method: 'POST',
      payload: {
        ...payload,
        sessionId,
      },
      url: `/api/projects/${projectId}/tasks`,
    });

    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }
});
