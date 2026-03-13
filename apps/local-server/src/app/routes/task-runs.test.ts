import { mkdtemp, rm } from 'node:fs/promises';
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
import { getAcpSessionById } from '../services/acp-service';
import { createProject } from '../services/project-service';
import { failTaskRun, startTaskRun } from '../services/task-run-service';
import { createTask, getTaskById, updateTask } from '../services/task-service';
import { responseContentType } from '../test-support/response-content-type';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
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
    expect(responseContentType(createResponse)).toBe(
      VENDOR_MEDIA_TYPES.taskRun,
    );
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
    expect(responseContentType(detailResponse)).toBe(
      VENDOR_MEDIA_TYPES.taskRun,
    );
    expect(detailResponse.json()).toMatchObject({
      id: taskRun.id,
    });

    const taskRunsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/runs`,
    });

    expect(taskRunsResponse.statusCode).toBe(200);
    expect(responseContentType(taskRunsResponse)).toBe(
      VENDOR_MEDIA_TYPES.taskRuns,
    );
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
    expect(responseContentType(projectRunsResponse)).toBe(
      VENDOR_MEDIA_TYPES.taskRuns,
    );
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
    expect(responseContentType(patchResponse)).toBe(VENDOR_MEDIA_TYPES.taskRun);
    expect(patchResponse.json()).toMatchObject({
      completedAt: '2026-03-12T00:10:00.000Z',
      id: taskRunId,
      isLatest: true,
      status: 'COMPLETED',
      summary: 'Execution finished',
      verificationReport: 'Checks passed',
      verificationVerdict: 'pass',
    });
  });

  it('retries the latest failed task run without overwriting history', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Run Retry Route',
      repoPath: '/tmp/team-ai-task-run-retry-route',
    });
    const sessionId = createAcpSession(
      sqlite,
      project.id,
      'Retry source session',
    );
    const task = await createTask(sqlite, {
      objective: 'Retry a failed run through the dedicated route',
      projectId: project.id,
      title: 'Retryable run task',
      triggerSessionId: sessionId,
    });
    const failedRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId,
      taskId: task.id,
    });

    await failTaskRun(sqlite, failedRun.id, {
      summary: 'Initial execution failed',
      verificationVerdict: 'fail',
    });
    await updateTask(sqlite, task.id, {
      resultSessionId: sessionId,
      status: 'FAILED',
      verificationVerdict: 'fail',
    });

    const retryResponse = await fastify.inject({
      method: 'POST',
      url: `/api/task-runs/${failedRun.id}/retry`,
    });

    expect(retryResponse.statusCode).toBe(201);
    expect(responseContentType(retryResponse)).toBe(VENDOR_MEDIA_TYPES.taskRun);
    expect(retryResponse.json()).toMatchObject({
      isLatest: true,
      retryOfRunId: failedRun.id,
      sessionId: expect.stringMatching(/^acps_/),
      status: 'COMPLETED',
      summary: 'ACP session completed',
      taskId: task.id,
      verificationReport: 'ACP session completed',
      verificationVerdict: 'pass',
    });

    const retriedRun = retryResponse.json() as {
      id: string;
      sessionId: string;
    };
    const updatedTask = await getTaskById(sqlite, task.id);
    const retriedSession = await getAcpSessionById(
      sqlite,
      retriedRun.sessionId,
    );
    const taskRunsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/runs`,
    });

    expect(updatedTask).toMatchObject({
      completionSummary: 'ACP session completed',
      executionSessionId: null,
      resultSessionId: retriedRun.sessionId,
      status: 'COMPLETED',
      verificationReport: 'ACP session completed',
      verificationVerdict: 'pass',
    });
    expect(retriedSession).toMatchObject({
      id: retriedRun.sessionId,
      state: 'COMPLETED',
      task: { id: task.id },
    });
    expect(taskRunsResponse.statusCode).toBe(200);
    expect(taskRunsResponse.json()).toMatchObject({
      total: 2,
      _embedded: {
        taskRuns: [
          expect.objectContaining({
            id: retriedRun.id,
            isLatest: true,
            retryOfRunId: failedRun.id,
            sessionId: retriedRun.sessionId,
            status: 'COMPLETED',
          }),
          expect.objectContaining({
            id: failedRun.id,
            isLatest: false,
            sessionId,
            status: 'FAILED',
          }),
        ],
      },
    });
    expect(fastify.acpRuntime.createSession).toHaveBeenCalledTimes(1);

    const historicalRetryResponse = await fastify.inject({
      method: 'POST',
      url: `/api/task-runs/${failedRun.id}/retry`,
    });

    expect(historicalRetryResponse.statusCode).toBe(409);
    expect(historicalRetryResponse.json()).toMatchObject({
      title: 'Task Run Retry Source Not Latest',
      type: 'https://team-ai.dev/problems/task-run-retry-source-not-latest',
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
