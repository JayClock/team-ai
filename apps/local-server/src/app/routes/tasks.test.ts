import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import projectSessionsRoute from './project-sessions';
import sessionsRoute from './sessions';
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

  it('creates tasks from a session and exposes detail plus session/project listings', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Desktop Project',
      repoPath: '/tmp/team-ai-task-project',
    });
    const sessionId = await createSession(fastify, project.id, 'Root session');

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/tasks`,
      payload: {
        acceptanceCriteria: ['Task list available'],
        labels: ['backend'],
        objective: 'Add task listing',
        priority: 'high',
        status: 'READY',
        title: 'Implement task routes',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.headers.location).toMatch(/^\/api\/tasks\/task_/);

    const task = createResponse.json() as { id: string };
    expect(task).toMatchObject({
      objective: 'Add task listing',
      projectId: project.id,
      title: 'Implement task routes',
      triggerSessionId: sessionId,
    });

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: task.id,
      _links: {
        session: {
          href: `/api/sessions/${sessionId}`,
        },
      },
    });

    const sessionTasksResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/tasks`,
    });

    expect(sessionTasksResponse.statusCode).toBe(200);
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
    const sessionId = await createSession(fastify, project.id, 'Task session');
    const taskId = await createTask(fastify, sessionId, {
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

  it('rejects empty task patches and missing sessions', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Errors',
      repoPath: '/tmp/team-ai-task-errors',
    });
    const sessionId = await createSession(fastify, project.id, 'Task error session');
    const taskId = await createTask(fastify, sessionId, {
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
      url: '/api/sessions/sess_missing/tasks',
      payload: {
        objective: 'Should fail',
        title: 'Missing session task',
      },
    });

    expect(missingSessionResponse.statusCode).toBe(404);
    expect(missingSessionResponse.json()).toMatchObject({
      title: 'Session Not Found',
      type: 'https://team-ai.dev/problems/session-not-found',
    });
  });

  it('resolves assigned specialists from workspace directories', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const repoPath = await mkdtemp(join(tmpdir(), 'team-ai-task-route-specialist-'));
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
    const sessionId = await createSession(fastify, project.id, 'Specialist task session');

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/tasks`,
      payload: {
        assignedSpecialistId: 'frontend-crafter',
        objective: 'Use specialist',
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
    const sessionId = await createSession(fastify, project.id, 'Invalid role session');

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/tasks`,
      payload: {
        assignedRole: 'planner',
        objective: 'Reject invalid role',
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

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(projectSessionsRoute, { prefix: '/api' });
    await fastify.register(sessionsRoute, { prefix: '/api' });
    await fastify.register(tasksRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  async function createSession(
    fastify: ReturnType<typeof Fastify>,
    projectId: string,
    title: string,
  ) {
    const response = await fastify.inject({
      method: 'POST',
      payload: { title },
      url: `/api/projects/${projectId}/sessions`,
    });

    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }

  async function createTask(
    fastify: ReturnType<typeof Fastify>,
    sessionId: string,
    payload: {
      objective: string;
      title: string;
    },
  ) {
    const response = await fastify.inject({
      method: 'POST',
      payload,
      url: `/api/sessions/${sessionId}/tasks`,
    });

    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }
});
