import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fp from 'fastify-plugin';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import { initializeDatabase } from '../db/sqlite';
import { getAgentById } from '../services/agent-service';
import { getAcpSessionById } from '../services/acp-service';
import { createBackgroundTask } from '../services/background-task-service';
import { ensureDefaultKanbanBoard } from '../services/kanban-board-service';
import { createProject } from '../services/project-service';
import { createTask, getTaskById } from '../services/task-service';
import sqlitePlugin from './sqlite';
import acpStreamPlugin from './acp-stream';
import backgroundWorkerPlugin from './background-worker';

describe('background worker plugin', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();

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

  it('starts on ready and stops on close when enabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(backgroundWorkerPlugin, {
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(true);

    fastifyInstances.pop();
    await fastify.close();
    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(false);
  });

  it('stays stopped when explicitly disabled', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(backgroundWorkerPlugin, {
      enabled: false,
      intervalMs: 1000,
    });
    await fastify.ready();

    expect(fastify.backgroundWorkerHostService.isRunning()).toBe(false);
  });

  it('records lane session history for task-backed background work', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(backgroundWorkerPlugin, {
      enabled: false,
    });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      repoPath: process.cwd(),
      title: 'Background Lane Session',
    });
    const board = await ensureDefaultKanbanBoard(fastify.sqlite, project.id);
    const todoColumn = board.columns.find((column) => column.name === 'Todo');
    const task = await createTask(fastify.sqlite, {
      assignedRole: 'CRAFTER',
      boardId: board.id,
      columnId: todoColumn?.id ?? null,
      objective: 'Track background worker sessions in lane history',
      projectId: project.id,
      title: 'Lane session task',
    });
    const backgroundTask = await createBackgroundTask(fastify.sqlite, {
      agentId: 'codex',
      projectId: project.id,
      prompt: 'Run the task lane background work',
      taskId: task.id,
      title: 'Lane session background task',
    });

    const [dispatched] =
      await fastify.backgroundWorkerService.dispatchPending(1);
    const updatedTask = await getTaskById(fastify.sqlite, task.id);

    expect(dispatched).toMatchObject({
      id: backgroundTask.id,
      status: 'COMPLETED',
    });
    expect(updatedTask.laneSessions).toEqual([
      expect.objectContaining({
        columnId: todoColumn?.id,
        columnName: 'Todo',
        provider: 'codex',
        role: 'CRAFTER',
        sessionId: dispatched.resultSessionId,
        status: 'completed',
      }),
    ]);
    expect(updatedTask.triggerSessionId).toBe(dispatched.resultSessionId);
    expect(updatedTask.resultSessionId).toBe(dispatched.resultSessionId);
  });

  it('uses specialist defaultAdapter and roleReminder for specialist-bound tasks', async () => {
    await createStandaloneDatabase(cleanupTasks);
    const fastify = Fastify({ logger: false });
    fastifyInstances.push(fastify);

    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(
      fp(
        async (instance) => {
          instance.decorate('acpRuntime', createRuntimeStub());
        },
        { name: 'acp-runtime' },
      ),
    );
    await fastify.register(backgroundWorkerPlugin, {
      enabled: false,
    });
    await fastify.ready();

    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-adapter-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });
    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'adapter-backed.md'),
      [
        '---',
        'id: adapter-backed',
        'name: Adapter Backed',
        'role: DEVELOPER',
        'defaultAdapter: codex',
        'roleReminder: Keep the task scope tight.',
        '---',
        'Implement the requested change.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(fastify.sqlite, {
      repoPath,
      title: 'Specialist Adapter Fallback',
    });
    const backgroundTask = await createBackgroundTask(fastify.sqlite, {
      agentId: 'adapter-backed',
      projectId: project.id,
      prompt: 'Execute via the specialist default adapter',
      specialistId: 'adapter-backed',
      title: 'Adapter-backed task',
    });

    const [dispatched] =
      await fastify.backgroundWorkerService.dispatchPending(1);

    expect(dispatched).toMatchObject({
      id: backgroundTask.id,
      status: 'COMPLETED',
    });

    const session = await getAcpSessionById(
      fastify.sqlite,
      dispatched.resultSessionId as string,
    );
    const agent = await getAgentById(
      fastify.sqlite,
      project.id,
      session.agent?.id as string,
    );

    expect(session.provider).toBe('codex');
    expect(session.specialistId).toBe('adapter-backed');
    expect(agent.systemPrompt).toContain(
      'Reminder: Keep the task scope tight.',
    );
  });
});

function createRuntimeStub(): AcpRuntimeClient {
  return {
    cancelSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createSession: vi.fn(async (input) => ({
      provider: input.provider,
      runtimeSessionId: 'runtime-worker-test',
    })),
    killSession: vi.fn(async () => undefined),
    isConfigured: vi.fn((provider?: string) => provider === 'codex'),
    isSessionActive: vi.fn(() => false),
    loadSession: vi.fn(async (input) => ({
      provider: input.provider,
      runtimeSessionId: input.runtimeSessionId,
    })),
    promptSession: vi.fn(async () => ({
      response: {
        stopReason: 'end_turn',
        usage: null,
        userMessageId: null,
      },
      runtimeSessionId: 'runtime-worker-test',
    })),
  };
}

async function createStandaloneDatabase(
  cleanupTasks: Array<() => Promise<void>>,
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-background-plugin-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();
  sqlite.close();

  cleanupTasks.push(async () => {
    if (previousDataDir === undefined) {
      delete process.env.TEAMAI_DATA_DIR;
    } else {
      process.env.TEAMAI_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });
}
