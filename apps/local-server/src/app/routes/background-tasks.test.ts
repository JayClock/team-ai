import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import type { KanbanWorkflowOrchestrator } from '../services/kanban-workflow-orchestrator-service';
import { createBackgroundTask, updateBackgroundTaskStatus } from '../services/background-task-service';
import { createProject } from '../services/project-service';
import { createTask, updateTask } from '../services/task-service';
import { createWorkflow, triggerWorkflow } from '../services/workflow-service';
import type { BackgroundWorkerHostService } from '../services/background-worker-host-service';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import backgroundTasksRoute from './background-tasks';

describe('background tasks route', () => {
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

  it('creates and lists background tasks for a project', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/background-task-foundation',
      title: 'Background Task Foundation',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/background-tasks`,
      payload: {
        agentId: 'crafter',
        prompt: 'Implement the kanban foundation phase',
        title: 'Kanban Foundation Task',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(responseContentType(createResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTask,
    );
    expect(createResponse.json()).toMatchObject({
      agentId: 'crafter',
      projectId: project.id,
      status: 'PENDING',
      title: 'Kanban Foundation Task',
      triggerSource: 'manual',
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/background-tasks`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTasks,
    );
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        backgroundTasks: [
          {
            agentId: 'crafter',
            status: 'PENDING',
            title: 'Kanban Foundation Task',
          },
        ],
      },
      total: 1,
    });
  });

  it('returns a background task by id', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/background-task-detail',
      title: 'Background Task Detail',
    });
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/background-tasks`,
      payload: {
        agentId: 'gate',
        prompt: 'Review the kanban foundation phase',
      },
    });
    const backgroundTaskId = (createResponse.json() as { id: string }).id;

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/background-tasks/${backgroundTaskId}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(responseContentType(detailResponse)).toBe(
      VENDOR_MEDIA_TYPES.backgroundTask,
    );
    expect(detailResponse.json()).toMatchObject({
      agentId: 'gate',
      id: backgroundTaskId,
      projectId: project.id,
      status: 'PENDING',
    });
  });

  it('manually triggers one background worker cycle', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    fastify.decorate('backgroundWorkerHostService', {
      isRunning: () => true,
      start: () => undefined,
      stop: () => undefined,
      tickNow: async () => ({
        completed: [
          {
            id: 'bgt_completed',
          },
        ],
        dispatched: [
          {
            id: 'bgt_dispatched',
          },
        ],
      }),
    } satisfies BackgroundWorkerHostService);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/background-tasks/process',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      completedCount: 1,
      completedTaskIds: ['bgt_completed'],
      dispatchedCount: 1,
      dispatchedTaskIds: ['bgt_dispatched'],
      running: true,
    });
  });

  it('returns orchestration visibility across worker, kanban, and workflow state', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/Users/example/background-task-status',
      title: 'Background Task Status',
    });
    const readyTask = await createBackgroundTask(sqlite, {
      agentId: 'crafter',
      projectId: project.id,
      prompt: 'Ready task',
      title: 'Ready task',
    });
    const runningTask = await createBackgroundTask(sqlite, {
      agentId: 'gate',
      projectId: project.id,
      prompt: 'Running task',
      title: 'Running task',
    });
    await updateBackgroundTaskStatus(sqlite, runningTask.id, 'RUNNING', {
      startedAt: '2026-03-17T00:00:00.000Z',
    });

    const workflow = await createWorkflow(sqlite, {
      name: 'Status Workflow',
      projectId: project.id,
      steps: [
        {
          name: 'Implement',
          parallelGroup: null,
          prompt: 'Implement workflow status',
          specialistId: 'backend-crafter',
        },
      ],
    });
    const triggered = await triggerWorkflow(sqlite, workflow.id);
    const gatedTask = await createTask(sqlite, {
      columnId: 'review',
      objective: 'Wait for artifact evidence before auto-advancing review work',
      projectId: project.id,
      title: 'Artifact gated task',
    });
    await updateTask(sqlite, gatedTask.id, {
      laneHandoffs: [
        {
          fromSessionId: 'acps_review',
          id: 'handoff_review',
          request: 'Need a local URL before review can pass.',
          requestType: 'environment_preparation',
          requestedAt: '2026-03-17T00:01:00.000Z',
          responseSummary: 'Server still needs to be started.',
          respondedAt: '2026-03-17T00:02:00.000Z',
          status: 'blocked',
          toSessionId: 'acps_dev',
        },
      ],
      laneSessions: [
        {
          columnId: 'review',
          role: 'GATE',
          sessionId: 'acps_review',
          specialistId: 'gate-reviewer',
          startedAt: '2026-03-17T00:00:00.000Z',
          status: 'running',
        },
      ],
      lastSyncError:
        'Artifact gate blocked auto-advance from Review: missing local URL',
      verificationReport:
        'Artifact gate blocked auto-advance from Review: missing local URL',
      verificationVerdict: 'fail',
    });

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    fastify.decorate('backgroundWorkerHostService', {
      isRunning: () => true,
      start: () => undefined,
      stop: () => undefined,
      tickNow: async () => ({
        completed: [],
        dispatched: [],
      }),
    } satisfies BackgroundWorkerHostService);
    fastify.decorate('kanbanWorkflowOrchestrator', {
      getActiveAutomations: () => [
        {
          autoAdvanceOnSuccess: false,
          boardId: 'brd_status',
          columnId: 'col_dev',
          projectId: project.id,
          sessionId: 'acps_active',
          taskId: 'task_active',
          taskTitle: 'Active task',
          triggerSessionId: 'acps_active',
        },
      ],
      getQueuedAutomations: () => [
        {
          boardId: 'brd_status',
          columnId: 'col_review',
          enqueuedAt: '2026-03-17T00:00:00.000Z',
          projectId: project.id,
          taskId: 'task_queued',
          taskTitle: 'Queued task',
        },
      ],
      start: () => undefined,
      stop: () => undefined,
    } satisfies KanbanWorkflowOrchestrator);

    await fastify.register(problemJsonPlugin);
    await fastify.register(backgroundTasksRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/background-tasks/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      artifactGates: {
        blockedTaskCount: 1,
        blockedTasks: [
          expect.objectContaining({
            columnId: 'review',
            id: gatedTask.id,
            lastSyncError:
              'Artifact gate blocked auto-advance from Review: missing local URL',
            latestLaneHandoff: expect.objectContaining({
              fromSessionId: 'acps_review',
              id: 'handoff_review',
              requestType: 'environment_preparation',
              status: 'blocked',
              toSessionId: 'acps_dev',
            }),
            latestLaneSession: expect.objectContaining({
              columnId: 'review',
              role: 'GATE',
              sessionId: 'acps_review',
              specialistId: 'gate-reviewer',
              status: 'running',
            }),
            title: 'Artifact gated task',
            triggerSessionId: null,
            verificationVerdict: 'fail',
          }),
        ],
      },
      backgroundWorker: {
        readyTasks: expect.arrayContaining([
          expect.objectContaining({
            id: readyTask.id,
            projectId: project.id,
            status: 'PENDING',
            title: 'Ready task',
          }),
          expect.objectContaining({
            id: triggered.taskIds[0],
            projectId: project.id,
            status: 'PENDING',
          }),
        ]),
        readyTaskCount: 2,
        readyTaskIds: expect.arrayContaining([readyTask.id, triggered.taskIds[0]]),
        running: true,
        runningTasks: [
          expect.objectContaining({
            id: runningTask.id,
            projectId: project.id,
            startedAt: '2026-03-17T00:00:00.000Z',
            status: 'RUNNING',
            title: 'Running task',
          }),
        ],
        runningTaskCount: 1,
        runningTaskIds: [runningTask.id],
      },
      kanban: {
        activeAutomationCount: 1,
        activeAutomations: [
          expect.objectContaining({
            projectId: project.id,
            sessionId: 'acps_active',
            taskId: 'task_active',
          }),
        ],
        activeTaskIds: ['task_active'],
        queuedAutomations: [
          expect.objectContaining({
            projectId: project.id,
            taskId: 'task_queued',
          }),
        ],
        queuedAutomationCount: 1,
        queuedTaskIds: ['task_queued'],
      },
      traces: {
        byEventType: expect.any(Object),
        recentOrchestrationTraces: [],
        totalCount: 0,
        uniqueSessions: 0,
      },
      workflows: {
        runningRunCount: 1,
        runningRunIds: [triggered.workflowRun.id],
        runningRuns: [
          expect.objectContaining({
            id: triggered.workflowRun.id,
            projectId: project.id,
            status: 'RUNNING',
            workflowId: workflow.id,
            workflowName: 'Status Workflow',
          }),
        ],
      },
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-background-route-'));
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
});
