import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import {
  ensureDefaultKanbanBoard,
  updateKanbanBoard,
  updateKanbanColumn,
} from '../services/kanban-board-service';
import { createProject } from '../services/project-service';
import { createKanbanEventService } from '../services/kanban-event-service';
import { getTaskById, updateTask } from '../services/task-service';
import { upsertTaskLaneSession } from '../services/task-lane-service';
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
        collection: {
          href: `/api/projects/${project.id}/tasks`,
        },
        self: {
          href: `/api/tasks/${task.id}`,
        },
      },
    });
    expect(detailResponse.json()._links.execute).toBeUndefined();

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

  it('removes the old explicit execute and orchestration-summary routes from the main HTTP path', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Cutover',
      repoPath: '/tmp/team-ai-task-cutover',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Task cutover session');
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Verify removed routes',
      title: 'Removed routes task',
    });

    const executeResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/execute`,
    });
    expect(executeResponse.statusCode).toBe(404);

    const summaryResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/orchestration-summary?sessionId=${sessionId}`,
    });
    expect(summaryResponse.statusCode).toBe(404);
  });

  it('rejects empty task patches and missing trigger sessions', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Errors',
      repoPath: '/tmp/team-ai-task-errors',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Task error session');
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
    const sessionId = createAcpSession(sqlite, project.id, 'Specialist task session');

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
    const sessionId = createAcpSession(sqlite, project.id, 'Invalid role session');

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

  it('emits kanban transition events when a task is created or moved across columns', async () => {
    const sqlite = await createTestDatabase();
    const events = createKanbanEventService();
    const emitted: Array<{
      fromColumnId: string | null;
      taskId: string;
      toColumnId: string;
      type: string;
    }> = [];

    events.subscribe(async (event) => {
      emitted.push({
        fromColumnId:
          event.type === 'task.column-transition' ? event.fromColumnId : null,
        taskId: event.taskId,
        toColumnId:
          event.type === 'task.column-transition' ? event.toColumnId : '',
        type: event.type,
      });
    });
    const fastify = await createTestServer(sqlite, {
      kanbanEventService: events,
    });

    const project = await createProject(sqlite, {
      title: 'Kanban Event Project',
      repoPath: '/tmp/team-ai-task-kanban-events',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const sessionId = createAcpSession(sqlite, project.id, 'Kanban session');

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: {
        boardId: board.id,
        columnId: todoColumn?.id ?? null,
        objective: 'Create in kanban',
        sessionId,
        title: 'Kanban task',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const taskId = (createResponse.json() as { id: string }).id;

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        columnId: devColumn?.id ?? null,
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(emitted).toEqual([
      {
        fromColumnId: todoColumn?.id ?? '',
        taskId,
        toColumnId: devColumn?.id ?? '',
        type: 'task.column-transition',
      },
    ]);
  });

  it('archives the active trigger session when a card moves to a new column', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Transition Session Archive',
      repoPath: '/tmp/team-ai-task-transition-session-archive',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const sessionId = createAcpSession(sqlite, project.id, 'Transition session');
    const taskId = await createTask(fastify, project.id, sessionId, {
      objective: 'Archive the active trigger session',
      title: 'Archive session task',
    });

    const task = await updateTask(sqlite, taskId, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      triggerSessionId: sessionId,
    });
    upsertTaskLaneSession(task, {
      columnId: todoColumn?.id ?? undefined,
      columnName: todoColumn?.name,
      sessionId,
    });
    await updateTask(sqlite, taskId, {
      laneSessions: task.laneSessions,
      triggerSessionId: sessionId,
    });

    const patchResponse = await fastify.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: {
        boardId: board.id,
        columnId: devColumn?.id ?? null,
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    const updatedTask = await getTaskById(sqlite, taskId);
    expect(updatedTask.triggerSessionId).toBeNull();
    expect(updatedTask.sessionIds).toContain(sessionId);
    expect(updatedTask.laneSessions).toEqual([
      expect.objectContaining({
        sessionId,
        status: 'transitioned',
      }),
    ]);
  });

  it('moves a card through the dedicated move endpoint', async () => {
    const sqlite = await createTestDatabase();
    const events = createKanbanEventService();
    const fastify = await createTestServer(sqlite, {
      kanbanEventService: events,
    });
    const project = await createProject(sqlite, {
      title: 'Task Move Endpoint',
      repoPath: '/tmp/team-ai-task-move-endpoint',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const blockedColumn = board.columns.find((column) => column.name === 'Blocked');
    const taskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Move this card through the dedicated endpoint',
      title: 'Move endpoint task',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: blockedColumn?.id ?? null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.task);
    expect(response.json()).toMatchObject({
      boardId: board.id,
      columnId: blockedColumn?.id ?? null,
      status: 'WAITING_RETRY',
    });

    const restoreResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: todoColumn?.id ?? null,
      },
    });

    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toMatchObject({
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      status: 'PENDING',
    });
  });

  it('supports moving a review card back to dev', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Review Backflow Endpoint',
      repoPath: '/tmp/team-ai-review-backflow-endpoint',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const taskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      kind: 'review',
      objective: 'Move this review card back into dev',
      title: 'Review backflow task',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: devColumn?.id ?? null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      boardId: board.id,
      columnId: devColumn?.id ?? null,
      status: 'READY',
    });
  });

  it('rejects stale move requests when the card changed after the board was loaded', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Move Conflict',
      repoPath: '/tmp/team-ai-task-move-conflict',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const taskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Move with stale board state',
      title: 'Stale move task',
    });

    const initialTask = await getTaskById(sqlite, taskId);
    await updateTask(sqlite, taskId, {
      completionSummary: 'Background automation already touched this card.',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: reviewColumn?.id ?? null,
        expectedUpdatedAt: initialTask.updatedAt,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      detail:
        'The card changed since it was loaded. Refresh the board and try the move again.',
      title: 'Kanban Card Stale',
      type: 'https://team-ai.dev/problems/kanban-card-stale',
    });

    const unchangedTask = await getTaskById(sqlite, taskId);
    expect(unchangedTask.columnId).toBe(todoColumn?.id ?? null);
  });

  it('blocks moves that would exceed the board WIP limit', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task WIP Policy',
      repoPath: '/tmp/team-ai-task-wip-policy',
    });
    const configuredBoard = await updateKanbanBoard(sqlite, {
      boardId: (await ensureDefaultKanbanBoard(sqlite, project.id)).id,
      projectId: project.id,
      settings: {
        wipLimit: 1,
      },
    });
    const backlogColumn = configuredBoard.columns.find((column) => column.name === 'Backlog');
    const todoColumn = configuredBoard.columns.find((column) => column.name === 'Todo');
    await createTask(fastify, project.id, null, {
      boardId: configuredBoard.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Already active',
      title: 'Active task',
    });
    const backlogTaskId = await createTask(fastify, project.id, null, {
      boardId: configuredBoard.id,
      columnId: backlogColumn?.id ?? null,
      objective: 'Wait in backlog',
      title: 'Blocked by WIP',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${backlogTaskId}/move`,
      payload: {
        boardId: configuredBoard.id,
        columnId: todoColumn?.id ?? null,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      detail: expect.stringContaining('Board WIP limit reached'),
      title: 'Kanban Policy Blocked Transition',
    });

    const unchangedTask = await getTaskById(sqlite, backlogTaskId);
    expect(unchangedTask.columnId).toBe(backlogColumn?.id ?? null);
  });

  it('blocks moves that violate column entry policy and records forced bypasses', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Entry Policy',
      repoPath: '/tmp/team-ai-task-entry-policy',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    if (!reviewColumn) {
      throw new Error('Review column is required for the test');
    }

    await updateKanbanColumn(sqlite, {
      automation: {
        allowedSourceColumnIds: [todoColumn?.id ?? ''],
        autoAdvanceOnSuccess: true,
        enabled: true,
        manualApprovalRequired: true,
        provider: null,
        requiredArtifacts: ['local URL'],
        role: reviewColumn.automation?.role ?? null,
        specialistId: reviewColumn.automation?.specialistId ?? null,
        specialistName: reviewColumn.automation?.specialistName ?? null,
        transitionType: 'entry',
      },
      boardId: board.id,
      columnId: reviewColumn.id,
      projectId: project.id,
    });

    const taskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: devColumn?.id ?? null,
      objective: 'Needs review policy checks',
      title: 'Policy guarded task',
    });

    const blockedResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: reviewColumn.id,
      },
    });

    expect(blockedResponse.statusCode).toBe(409);
    expect(blockedResponse.json()).toMatchObject({
      detail: expect.stringContaining('Only cards from'),
      title: 'Kanban Policy Blocked Transition',
    });

    const forcedResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/move`,
      payload: {
        boardId: board.id,
        columnId: reviewColumn.id,
        force: true,
        policyBypassReason: 'Release manager approved the exception.',
      },
    });

    expect(forcedResponse.statusCode).toBe(200);
    expect(forcedResponse.json()).toMatchObject({
      boardId: board.id,
      columnId: reviewColumn.id,
    });

    const bypassedTask = await getTaskById(sqlite, taskId);
    expect(bypassedTask.laneHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestType: 'policy_bypass',
          responseSummary: expect.stringContaining(
            'Release manager approved the exception.',
          ),
        }),
      ]),
    );
  });

  it('reorders cards within the same column when a position is provided', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Task Reorder Endpoint',
      repoPath: '/tmp/team-ai-task-reorder-endpoint',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const firstTaskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'First task',
      title: 'First task',
    });
    const secondTaskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Second task',
      title: 'Second task',
    });
    const thirdTaskId = await createTask(fastify, project.id, null, {
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Third task',
      title: 'Third task',
    });

    const reorderResponse = await fastify.inject({
      method: 'POST',
      url: `/api/tasks/${thirdTaskId}/move`,
      payload: {
        boardId: board.id,
        columnId: todoColumn?.id ?? null,
        position: 0,
      },
    });

    expect(reorderResponse.statusCode).toBe(200);
    expect(reorderResponse.json()).toMatchObject({
      id: thirdTaskId,
      position: 0,
    });

    const firstTask = await getTaskById(sqlite, firstTaskId);
    const secondTask = await getTaskById(sqlite, secondTaskId);
    const thirdTask = await getTaskById(sqlite, thirdTaskId);

    expect([thirdTask.position, firstTask.position, secondTask.position]).toEqual([
      0,
      1,
      2,
    ]);
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

  async function createTestServer(
    sqlite: Database,
    options?: {
      kanbanEventService?: ReturnType<typeof createKanbanEventService>;
    },
  ) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    if (options?.kanbanEventService) {
      fastify.decorate('kanbanEventService', options.kanbanEventService);
    }

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
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
