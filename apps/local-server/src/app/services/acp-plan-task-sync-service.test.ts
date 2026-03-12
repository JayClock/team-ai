import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { listTasks } from './task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { syncPlanEventToTasks } from './acp-plan-task-sync-service';

describe('acp plan task sync service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates one task per plan entry and stays idempotent for the same event', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Plan Sync Project',
      repoPath: '/Users/example/plan-sync',
    });

    insertAcpSession(sqlite, {
      id: 'acps_planroot01',
      name: 'Root planning session',
      projectId: project.id,
    });

    const first = syncPlanEventToTasks(sqlite, {
      emittedAt: '2026-03-12T10:00:00.000Z',
      entries: [
        {
          content: 'Implement ACP plan sync to project tasks',
          priority: 'high',
          status: 'pending',
        },
        {
          content: 'Verify synced tasks appear in the workbench',
          priority: 'medium',
          status: 'in_progress',
        },
      ],
      eventId: 'acpe_plan_sync_01',
      sessionId: 'acps_planroot01',
    });
    const second = syncPlanEventToTasks(sqlite, {
      emittedAt: '2026-03-12T10:00:00.000Z',
      entries: [
        {
          content: 'Implement ACP plan sync to project tasks',
          priority: 'high',
          status: 'pending',
        },
        {
          content: 'Verify synced tasks appear in the workbench',
          priority: 'medium',
          status: 'in_progress',
        },
      ],
      eventId: 'acpe_plan_sync_01',
      sessionId: 'acps_planroot01',
    });

    const tasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    expect(first).toEqual({ createdCount: 2, skipped: false });
    expect(second).toEqual({ createdCount: 0, skipped: false });
    expect(tasks.total).toBe(2);
    expect(tasks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignedRole: 'CRAFTER',
          kind: 'implement',
          priority: 'high',
          sourceEntryIndex: 0,
          sourceEventId: 'acpe_plan_sync_01',
          sourceType: 'acp_plan',
          status: 'PENDING',
          title: 'Implement ACP plan sync to project tasks',
          triggerSessionId: 'acps_planroot01',
        }),
        expect.objectContaining({
          assignedRole: 'GATE',
          kind: 'verify',
          priority: 'medium',
          sourceEntryIndex: 1,
          sourceEventId: 'acpe_plan_sync_01',
          sourceType: 'acp_plan',
          status: 'RUNNING',
          title: 'Verify synced tasks appear in the workbench',
          triggerSessionId: 'acps_planroot01',
        }),
      ]),
    );
  });

  it('skips plan sync for task-bound child sessions', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Child Plan Sync Project',
      repoPath: '/Users/example/child-plan-sync',
    });

    insertAcpSession(sqlite, {
      id: 'acps_planparent',
      name: 'Parent session',
      projectId: project.id,
    });
    insertAcpSession(sqlite, {
      id: 'acps_planchild',
      name: 'Task child session',
      parentSessionId: 'acps_planparent',
      projectId: project.id,
      taskId: 'task_existing_child',
    });

    const result = syncPlanEventToTasks(sqlite, {
      emittedAt: '2026-03-12T10:15:00.000Z',
      entries: [
        {
          content: 'Check implementation details',
          priority: 'low',
          status: 'pending',
        },
      ],
      eventId: 'acpe_plan_sync_02',
      sessionId: 'acps_planchild',
    });

    const tasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
    });

    expect(result).toEqual({ createdCount: 0, skipped: true });
    expect(tasks.total).toBe(0);
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-plan-sync-service-'));
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
