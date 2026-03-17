import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import type { TaskExecutionRuntime } from './task-execution-runtime-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { applyFlowTemplate } from './apply-flow-template-service';
import { createProject } from './project-service';
import { listTasks, updateTask } from './task-service';
import { dispatchGateTasksForCompletedWave } from './task-wave-service';

describe('task wave service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('dispatches the spec gate wave once implement tasks complete', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-wave-gate',
      title: 'Task Wave Gate',
    });
    const parentSessionId = 'acps_task_wave_parent';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-wave-gate',
      id: parentSessionId,
      name: 'Task wave parent',
      projectId: project.id,
      provider: 'codex',
    });

    const applied = await applyFlowTemplate(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
      templateId: 'routa-spec-loop',
    });

    const tasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const implementTask = tasks.items.find((task) => task.kind === 'implement');
    const reviewTask = tasks.items.find((task) => task.kind === 'review');

    if (!implementTask || !reviewTask) {
      throw new Error('Expected both implement and review spec tasks');
    }

    await updateTask(sqlite, implementTask.id, {
      completionSummary: 'Implemented and reported back to ROUTA',
      status: 'COMPLETED',
      verificationVerdict: 'pass',
    });

    let childSessionCount = 0;
    const runtime = createTestRuntime(sqlite, project.id, parentSessionId, () => {
      childSessionCount += 1;
      return `acps_task_wave_child_${childSessionCount}`;
    });

    const gateWave = await dispatchGateTasksForCompletedWave(
      sqlite,
      runtime,
      {
        callerSessionId: parentSessionId,
        noteId: applied.note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      },
    );

    expect(gateWave).toMatchObject({
      blockedTaskIds: [],
      dispatchedTaskIds: [reviewTask.id],
      gateTaskIds: [reviewTask.id],
      requiresGate: true,
      waveId: `twfg_${applied.note.id}:gate`,
      waveKind: 'gate',
    });

    const updatedReviewTask = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    }).then((payload) => payload.items.find((task) => task.id === reviewTask.id));

    expect(updatedReviewTask).toMatchObject({
      assignedRole: 'GATE',
      status: 'READY',
      triggerSessionId: 'acps_task_wave_child_1',
    });
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-wave-'));
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

function createTestRuntime(
  sqlite: Database,
  projectId: string,
  parentSessionId: string,
  nextSessionId: () => string,
): TaskExecutionRuntime {
  return {
    createSession: vi.fn(async (input) => {
      const sessionId = nextSessionId();
      insertAcpSession(sqlite, {
        actorId: input.actorUserId,
        cwd: input.cwd ?? '/tmp',
        id: sessionId,
        parentSessionId: input.parentSessionId ?? parentSessionId,
        projectId,
        provider: input.provider,
        taskId: input.taskId ?? null,
      });

      return { id: sessionId };
    }),
    isProviderAvailable: vi.fn(async () => true),
    promptSession: vi.fn(async () => undefined),
  };
}
