import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { createSession } from './session-service';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  updateTask,
} from './task-service';

describe('task service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates tasks with session linkage and lists them by project and session', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Team AI',
      repoPath: '/Users/example/team-ai',
    });
    const session = await createSession(sqlite, {
      projectId: project.id,
      title: 'Root session',
    });

    const task = await createTask(sqlite, {
      acceptanceCriteria: ['Expose route'],
      dependencies: [],
      labels: ['backend'],
      objective: 'Add task APIs',
      projectId: project.id,
      status: 'READY',
      title: 'Implement tasks',
      triggerSessionId: session.id,
      verificationCommands: ['npx nx test local-server'],
    });

    const byProject = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });
    const bySession = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      sessionId: session.id,
    });

    expect(task.triggerSessionId).toBe(session.id);
    expect(task.acceptanceCriteria).toEqual(['Expose route']);
    expect(byProject.items.map((item) => item.id)).toContain(task.id);
    expect(bySession.items.map((item) => item.id)).toContain(task.id);
  });

  it('updates task assignment and verification fields', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Update Task',
      repoPath: '/Users/example/update-task',
    });

    const task = await createTask(sqlite, {
      objective: 'Initial objective',
      projectId: project.id,
      title: 'Initial task',
    });

    const updated = await updateTask(sqlite, task.id, {
      assignedProvider: 'opencode',
      assignedRole: 'crafter',
      completionSummary: 'Implemented routes',
      dependencies: ['task_prev'],
      status: 'COMPLETED',
      verificationReport: 'All checks passed',
      verificationVerdict: 'pass',
    });

    expect(updated).toMatchObject({
      assignedProvider: 'opencode',
      assignedRole: 'crafter',
      completionSummary: 'Implemented routes',
      dependencies: ['task_prev'],
      status: 'COMPLETED',
      verificationReport: 'All checks passed',
      verificationVerdict: 'pass',
    });
  });

  it('rejects task creation when session belongs to another project', async () => {
    const sqlite = await createTestDatabase();
    const projectA = await createProject(sqlite, {
      title: 'Project A',
      repoPath: '/Users/example/project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Project B',
      repoPath: '/Users/example/project-b',
    });
    const session = await createSession(sqlite, {
      projectId: projectA.id,
      title: 'Foreign session',
    });

    await expect(
      createTask(sqlite, {
        objective: 'Invalid linkage',
        projectId: projectB.id,
        title: 'Cross project task',
        triggerSessionId: session.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-session-project-mismatch',
    });
  });

  it('soft deletes tasks and hides them from reads', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Delete Task',
      repoPath: '/Users/example/delete-task',
    });
    const task = await createTask(sqlite, {
      objective: 'Delete objective',
      projectId: project.id,
      title: 'Delete task',
    });

    await deleteTask(sqlite, task.id);

    await expect(getTaskById(sqlite, task.id)).rejects.toMatchObject({
      status: 404,
      type: 'https://team-ai.dev/problems/task-not-found',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-service-'));
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
