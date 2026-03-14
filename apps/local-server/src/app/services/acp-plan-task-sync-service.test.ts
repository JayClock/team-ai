import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { listTasks } from './task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import {
  syncPlanEventToTasks,
  syncPlanEventToTasksAndDispatch,
} from './acp-plan-task-sync-service';

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

  it('no longer creates tasks from ACP plan events', async () => {
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

    expect(first).toEqual({ createdCount: 0, skipped: true });
    expect(second).toEqual({ createdCount: 0, skipped: true });
    expect(tasks.total).toBe(0);
  });

  it('keeps plan sync disabled for task-bound child sessions', async () => {
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

  it('does not auto-dispatch ACP plan events for top-level ROUTA sessions', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Plan Sync Dispatch Project',
      repoPath: '/Users/example/plan-sync-dispatch',
    });

    insertAcpSession(sqlite, {
      id: 'acps_routa_root',
      name: 'Root ROUTA session',
      projectId: project.id,
      provider: 'codex',
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_routa_child',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await syncPlanEventToTasksAndDispatch(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        emittedAt: '2026-03-12T11:00:00.000Z',
        entries: [
          {
            content: 'Implement automatic plan dispatch',
            priority: 'high',
            status: 'pending',
          },
          {
            content: 'Verify dispatch diagnostics are recorded',
            priority: 'medium',
            status: 'completed',
          },
        ],
        eventId: 'acpe_plan_dispatch_01',
        sessionId: 'acps_routa_root',
      },
    );

    expect(result).toEqual({
      createdCount: 0,
      skipped: true,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: false,
        results: [],
        skippedReason: 'PLAN_SYNC_SKIPPED',
      },
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(promptSession).not.toHaveBeenCalled();
  });

  it('keeps nested ROUTA plan events disabled', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Child ROUTA Dispatch Guard Project',
      repoPath: '/Users/example/child-routa-dispatch-guard',
    });

    insertAcpSession(sqlite, {
      id: 'acps_parent_root',
      name: 'Parent root session',
      projectId: project.id,
      provider: 'codex',
    });
    insertAcpSession(sqlite, {
      id: 'acps_child_routa',
      name: 'Child ROUTA session',
      parentSessionId: 'acps_parent_root',
      projectId: project.id,
      provider: 'codex',
    });

    const createSession = vi.fn(async () => ({
      id: 'acps_should_not_exist',
    }));
    const promptSession = vi.fn(async () => undefined);

    const result = await syncPlanEventToTasksAndDispatch(
      sqlite,
      {
        createSession,
        promptSession,
      },
      {
        emittedAt: '2026-03-12T11:30:00.000Z',
        entries: [
          {
            content: 'Implement a nested task without auto dispatch',
            priority: 'medium',
            status: 'pending',
          },
        ],
        eventId: 'acpe_plan_dispatch_02',
        sessionId: 'acps_child_routa',
      },
    );

    expect(result).toEqual({
      createdCount: 0,
      skipped: true,
      autoDispatch: {
        attempted: false,
        dispatchedCount: 0,
        eligible: false,
        results: [],
        skippedReason: 'PLAN_SYNC_SKIPPED',
      },
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(promptSession).not.toHaveBeenCalled();
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
