import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import { createTask } from '../services/task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import taskRunsRoute from './task-runs';

describe('task run routes', () => {
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

  it('creates task runs and lists them by task and project', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Runs',
      repoPath: '/tmp/team-ai-task-runs',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Task run session');
    const task = await createTask(sqlite, {
      objective: 'Track execution attempts',
      projectId: project.id,
      title: 'Task with runs',
      triggerSessionId: sessionId,
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/runs`,
      payload: {
        provider: 'opencode',
        sessionId,
        startedAt: '2026-03-12T00:00:00.000Z',
        status: 'RUNNING',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const taskRun = createResponse.json() as { id: string };
    expect(createResponse.json()).toMatchObject({
      projectId: project.id,
      sessionId,
      status: 'RUNNING',
      taskId: task.id,
      _links: {
        task: {
          href: `/api/tasks/${task.id}`,
        },
      },
    });

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/task-runs/${taskRun.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: taskRun.id,
    });

    const taskRunsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/runs`,
    });

    expect(taskRunsResponse.statusCode).toBe(200);
    expect(taskRunsResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        taskRuns: [expect.objectContaining({ id: taskRun.id })],
      },
    });

    const projectRunsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/task-runs`,
    });

    expect(projectRunsResponse.statusCode).toBe(200);
    expect(projectRunsResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        taskRuns: [expect.objectContaining({ id: taskRun.id })],
      },
    });
  });

  it('updates task run verification fields', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Run Updates',
      repoPath: '/tmp/team-ai-task-run-updates',
    });
    const task = await createTask(sqlite, {
      objective: 'Update run status',
      projectId: project.id,
      title: 'Mutable run task',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/runs`,
      payload: {
        status: 'PENDING',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const taskRunId = (createResponse.json() as { id: string }).id;

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/task-runs/${taskRunId}`,
      payload: {
        completedAt: '2026-03-12T00:10:00.000Z',
        status: 'COMPLETED',
        summary: 'Execution finished',
        verificationReport: 'Checks passed',
        verificationVerdict: 'pass',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      completedAt: '2026-03-12T00:10:00.000Z',
      id: taskRunId,
      status: 'COMPLETED',
      summary: 'Execution finished',
      verificationReport: 'Checks passed',
      verificationVerdict: 'pass',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-runs-route-'));
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
    await fastify.register(taskRunsRoute, { prefix: '/api' });
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
      cwd: '/tmp/team-ai-task-runs',
      id: sessionId,
      name: title,
      projectId,
    });
    return sessionId;
  }
});
