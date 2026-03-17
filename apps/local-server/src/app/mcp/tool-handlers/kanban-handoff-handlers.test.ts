import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../../db/sqlite';
import { ensureDefaultKanbanBoard } from '../../services/kanban-board-service';
import { createProject } from '../../services/project-service';
import { getTaskById, createTask, updateTask } from '../../services/task-service';
import {
  createTaskLaneHandoff,
  upsertTaskLaneHandoff,
  upsertTaskLaneSession,
} from '../../services/task-lane-service';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import {
  createSubmitLaneHandoffHandler,
} from './agent-handlers';
import {
  createRequestPreviousLaneHandoffHandler,
} from './task-handlers';

const { promptAcpSessionMock } = vi.hoisted(() => ({
  promptAcpSessionMock: vi.fn(async () => ({
    runtime: {
      provider: 'codex',
      sessionId: 'runtime-handoff',
      stopReason: 'end_turn',
    },
    session: null,
  })),
}));

vi.mock('../../services/acp-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/acp-service')>(
    '../../services/acp-service',
  );

  return {
    ...actual,
    promptAcpSession: promptAcpSessionMock,
  };
});

describe('kanban handoff MCP handlers', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    promptAcpSessionMock.mockClear();

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('requests runtime support from the immediately previous lane session', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-kanban-handoff-request',
      title: 'Kanban Handoff Request',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const devSessionId = 'acps_lane_dev_1';
    const reviewSessionId = 'acps_lane_review_1';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-kanban-handoff-request',
      id: devSessionId,
      projectId: project.id,
      taskId: null,
    });
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-kanban-handoff-request',
      id: reviewSessionId,
      projectId: project.id,
      taskId: null,
    });

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: reviewColumn?.id ?? null,
      objective: 'Review the staged implementation',
      projectId: project.id,
      title: 'Review runtime task',
    });
    upsertTaskLaneSession(task, {
      columnId: devColumn?.id ?? undefined,
      columnName: devColumn?.name,
      sessionId: devSessionId,
      status: 'completed',
    });
    upsertTaskLaneSession(task, {
      columnId: reviewColumn?.id ?? undefined,
      columnName: reviewColumn?.name,
      sessionId: reviewSessionId,
      status: 'running',
    });
    await updateTask(sqlite, task.id, {
      laneSessions: task.laneSessions,
      triggerSessionId: reviewSessionId,
    });

    const handler = createRequestPreviousLaneHandoffHandler(
      createFastifyStub(sqlite),
    );
    const result = await handler({
      artifactHints: ['local URL', 'startup command'],
      projectId: project.id,
      request: 'Start the app and share the local URL.',
      requestType: 'environment_preparation',
      sessionId: reviewSessionId,
      taskId: task.id,
    });

    expect(result.delivered).toBe(true);
    expect(promptAcpSessionMock).toHaveBeenCalledWith(
      sqlite,
      expect.any(Object),
      expect.any(Object),
      project.id,
      devSessionId,
      expect.objectContaining({
        prompt: expect.stringContaining('Artifact expectations:\n- local URL\n- startup command'),
      }),
      expect.objectContaining({
        source: 'mcp_request_previous_lane_handoff',
      }),
    );

    const updatedTask = await getTaskById(sqlite, task.id);
    expect(updatedTask.laneHandoffs).toEqual([
      expect.objectContaining({
        artifactHints: ['local URL', 'startup command'],
        fromSessionId: reviewSessionId,
        requestType: 'environment_preparation',
        status: 'delivered',
        toSessionId: devSessionId,
      }),
    ]);
  });

  it('submits the handoff result back to the requesting lane session', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-kanban-handoff-submit',
      title: 'Kanban Handoff Submit',
    });
    const board = await ensureDefaultKanbanBoard(sqlite, project.id);
    const devColumn = board.columns.find((column) => column.name === 'Dev');
    const reviewColumn = board.columns.find((column) => column.name === 'Review');
    const devSessionId = 'acps_lane_dev_2';
    const reviewSessionId = 'acps_lane_review_2';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-kanban-handoff-submit',
      id: devSessionId,
      projectId: project.id,
      taskId: null,
    });
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-kanban-handoff-submit',
      id: reviewSessionId,
      projectId: project.id,
      taskId: null,
    });

    const task = await createTask(sqlite, {
      boardId: board.id,
      columnId: devColumn?.id ?? null,
      objective: 'Support review with runtime setup',
      projectId: project.id,
      title: 'Runtime support task',
    });
    upsertTaskLaneSession(task, {
      columnId: devColumn?.id ?? undefined,
      columnName: devColumn?.name,
      sessionId: devSessionId,
      status: 'running',
    });
    upsertTaskLaneSession(task, {
      columnId: reviewColumn?.id ?? undefined,
      columnName: reviewColumn?.name,
      sessionId: reviewSessionId,
      status: 'running',
    });
    upsertTaskLaneHandoff(
      task,
      createTaskLaneHandoff({
        fromColumnId: reviewColumn?.id,
        fromSessionId: reviewSessionId,
        id: 'handoff_runtime_1',
        request: 'Seed demo data and confirm the route.',
        requestType: 'runtime_context',
        status: 'delivered',
        toColumnId: devColumn?.id,
        toSessionId: devSessionId,
      }),
    );
    await updateTask(sqlite, task.id, {
      laneHandoffs: task.laneHandoffs,
      laneSessions: task.laneSessions,
      triggerSessionId: devSessionId,
    });

    const handler = createSubmitLaneHandoffHandler(createFastifyStub(sqlite));
    const result = await handler({
      artifacts: ['pnpm dev', 'http://127.0.0.1:3000'],
      handoffId: 'handoff_runtime_1',
      projectId: project.id,
      sessionId: devSessionId,
      status: 'completed',
      summary: 'Service is running on http://127.0.0.1:3000 with seeded demo data.',
      taskId: task.id,
    });

    expect(result.notified).toBe(true);
    expect(promptAcpSessionMock).toHaveBeenCalledWith(
      sqlite,
      expect.any(Object),
      expect.any(Object),
      project.id,
      reviewSessionId,
      expect.objectContaining({
        prompt: expect.stringContaining('Artifacts:\n- pnpm dev\n- http://127.0.0.1:3000'),
      }),
      expect.objectContaining({
        source: 'mcp_submit_lane_handoff',
      }),
    );

    const updatedTask = await getTaskById(sqlite, task.id);
    expect(updatedTask.laneHandoffs).toEqual([
      expect.objectContaining({
        artifactEvidence: ['pnpm dev', 'http://127.0.0.1:3000'],
        id: 'handoff_runtime_1',
        responseSummary:
          'Service is running on http://127.0.0.1:3000 with seeded demo data.',
        status: 'completed',
      }),
    ]);
  });
});

function createFastifyStub(sqlite: Database) {
  return {
    acpRuntime: {
      isSessionActive: vi.fn(() => true),
    },
    acpStreamBroker: {
      publish: vi.fn(),
    },
    log: {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    } as unknown as FastifyBaseLogger,
    sqlite,
  } as unknown as FastifyInstance;
}

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-kanban-handoff-'));
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
