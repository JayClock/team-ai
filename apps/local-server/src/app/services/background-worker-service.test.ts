import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import {
  createBackgroundTask,
  getBackgroundTaskById,
  updateBackgroundTaskStatus,
} from './background-task-service';
import { createBackgroundWorkerService } from './background-worker-service';
import { createKanbanEventService } from './kanban-event-service';
import { createProject } from './project-service';
import { createTask } from './task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';

describe('background worker service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('dispatches only ready pending tasks and records their session ids', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-background-worker',
      title: 'Background Worker',
    });
    const dependency = await createBackgroundTask(sqlite, {
      agentId: 'codex',
      projectId: project.id,
      prompt: 'Run dependency first',
      title: 'Dependency',
    });
    await createBackgroundTask(sqlite, {
      agentId: 'codex',
      dependsOnTaskIds: [dependency.id],
      projectId: project.id,
      prompt: 'Wait for dependency',
      title: 'Dependent',
    });

    const createSession = vi.fn(async (task) => {
      const sessionId = `acps_${task.id}`;
      insertAcpSession(sqlite, {
        id: sessionId,
        projectId: project.id,
        taskId: task.taskId,
      });
      return {
        sessionId,
      };
    });
    const promptSession = vi.fn(async () => undefined);
    const worker = createBackgroundWorkerService({
      callbacks: {
        createSession,
        isSessionActive: async () => true,
        promptSession,
      },
      events: createKanbanEventService(),
      sqlite,
    });

    const dispatched = await worker.dispatchPending(1);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      id: dependency.id,
      resultSessionId: `acps_${dependency.id}`,
      status: 'RUNNING',
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(promptSession).toHaveBeenCalledTimes(1);

    const persistedDependency = await getBackgroundTaskById(sqlite, dependency.id);
    expect(persistedDependency).toMatchObject({
      resultSessionId: `acps_${dependency.id}`,
      status: 'RUNNING',
    });
  });

  it('marks finished sessions as completed and emits kanban completion events', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-background-complete',
      title: 'Background Completion',
    });
    const task = await createTask(sqlite, {
      objective: 'Background worker completion target',
      projectId: project.id,
      title: 'Completion target',
    });
    const backgroundTask = await createBackgroundTask(sqlite, {
      agentId: 'codex',
      projectId: project.id,
      prompt: 'Finish running work',
      taskId: task.id,
      title: 'Completion candidate',
    });
    insertAcpSession(sqlite, {
      id: 'acps_complete_1',
      projectId: project.id,
      taskId: task.id,
    });
    await updateBackgroundTaskStatus(sqlite, backgroundTask.id, 'RUNNING', {
      resultSessionId: 'acps_complete_1',
      startedAt: '2026-03-17T00:00:00.000Z',
    });

    const events = createKanbanEventService();
    const emitted: string[] = [];
    events.subscribe(async (event) => {
      emitted.push(event.type);
    });

    const worker = createBackgroundWorkerService({
      callbacks: {
        createSession: async () => ({ sessionId: 'unused' }),
        isSessionActive: async () => false,
        promptSession: async () => undefined,
      },
      events,
      sqlite,
    });

    const completed = await worker.checkCompletions();

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      id: backgroundTask.id,
      status: 'COMPLETED',
    });
    expect(emitted).toEqual(['background-task.completed']);

    const persisted = await getBackgroundTaskById(sqlite, backgroundTask.id);
    expect(persisted.status).toBe('COMPLETED');
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-background-worker-'));
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
