import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import {
  getDelegationGroupProgress,
  getOrCreateActiveDelegationGroup,
  registerDelegationGroupSession,
  registerDelegationGroupTask,
} from './delegation-group-service';
import { createProject } from './project-service';
import { createTask, updateTask } from './task-service';

describe('delegation group service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates or reuses an active group and records task/session membership', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-delegation-group-service',
      title: 'Delegation Group Service',
    });
    const parentSessionId = 'acps_delegation_parent';
    insertAcpSession(sqlite, {
      id: parentSessionId,
      projectId: project.id,
    });
    const childSessionId = 'acps_delegation_child';
    insertAcpSession(sqlite, {
      id: childSessionId,
      parentSessionId,
      projectId: project.id,
    });
    const task = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Track a delegated member task',
      parallelGroup: null,
      projectId: project.id,
      sessionId: parentSessionId,
      title: 'Delegated task',
    });

    const firstGroup = await getOrCreateActiveDelegationGroup(sqlite, {
      callerSessionId: parentSessionId,
      projectId: project.id,
    });
    const secondGroup = await getOrCreateActiveDelegationGroup(sqlite, {
      callerSessionId: parentSessionId,
      projectId: project.id,
    });

    expect(secondGroup.id).toBe(firstGroup.id);
    expect(firstGroup).toMatchObject({
      callerSessionId: parentSessionId,
      parentSessionId,
      sessionIds: [],
      status: 'OPEN',
      taskIds: [],
    });

    await registerDelegationGroupTask(sqlite, {
      groupId: firstGroup.id,
      taskId: task.id,
    });
    const groupWithSession = await registerDelegationGroupSession(sqlite, {
      groupId: firstGroup.id,
      sessionId: childSessionId,
      taskId: task.id,
    });

    expect(groupWithSession).toMatchObject({
      parentSessionId,
      sessionIds: [childSessionId],
      status: 'RUNNING',
      taskIds: [task.id],
    });
  });

  it('marks a settled group as failed when any member task finishes in a retryable failure state', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-delegation-group-progress',
      title: 'Delegation Group Progress',
    });
    const parentSessionId = 'acps_group_progress_parent';
    insertAcpSession(sqlite, {
      id: parentSessionId,
      projectId: project.id,
    });
    const childSessionA = 'acps_group_progress_child_a';
    const childSessionB = 'acps_group_progress_child_b';
    insertAcpSession(sqlite, {
      id: childSessionA,
      parentSessionId,
      projectId: project.id,
    });
    insertAcpSession(sqlite, {
      id: childSessionB,
      parentSessionId,
      projectId: project.id,
    });
    const firstTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'First grouped task',
      parallelGroup: null,
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'First grouped task',
    });
    const secondTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Second grouped task',
      parallelGroup: null,
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'Second grouped task',
    });

    const group = await getOrCreateActiveDelegationGroup(sqlite, {
      callerSessionId: parentSessionId,
      projectId: project.id,
    });

    await updateTask(sqlite, firstTask.id, { parallelGroup: group.id });
    await updateTask(sqlite, secondTask.id, { parallelGroup: group.id });
    await registerDelegationGroupTask(sqlite, {
      groupId: group.id,
      taskId: firstTask.id,
    });
    await registerDelegationGroupTask(sqlite, {
      groupId: group.id,
      taskId: secondTask.id,
    });
    await registerDelegationGroupSession(sqlite, {
      groupId: group.id,
      sessionId: childSessionA,
      taskId: firstTask.id,
    });
    await registerDelegationGroupSession(sqlite, {
      groupId: group.id,
      sessionId: childSessionB,
      taskId: secondTask.id,
    });

    await updateTask(sqlite, firstTask.id, {
      completionSummary: 'Finished successfully',
      resultSessionId: childSessionA,
      status: 'COMPLETED',
    });
    await updateTask(sqlite, secondTask.id, {
      completionSummary: 'Failed and waiting retry',
      resultSessionId: childSessionB,
      status: 'WAITING_RETRY',
    });

    const progress = await getDelegationGroupProgress(sqlite, {
      groupId: group.id,
      projectId: project.id,
    });

    expect(progress).toMatchObject({
      completedCount: 1,
      failureCount: 1,
      groupId: group.id,
      parentSessionId,
      pendingCount: 0,
      sessionIds: expect.arrayContaining([childSessionA, childSessionB]),
      settled: true,
      status: 'FAILED',
      taskIds: expect.arrayContaining([firstTask.id, secondTask.id]),
      totalCount: 2,
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-delegation-group-'));
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
