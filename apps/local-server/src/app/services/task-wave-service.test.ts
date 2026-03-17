import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import type { TaskSessionDispatchCallbacks } from './task-session-dispatch-core-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { createNote } from './note-service';
import { createProject } from './project-service';
import { createTask, listTasks, updateTask } from './task-service';
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

    const note = await createNote(sqlite, {
      content: '## Goal\nDrive a spec-derived gate wave.',
      projectId: project.id,
      sessionId: parentSessionId,
      source: 'system',
      title: 'Spec',
      type: 'spec',
    });
    const implementTask = await createTask(sqlite, {
      assignedRole: 'CRAFTER',
      kind: 'implement',
      objective: 'Implement the spec-derived change',
      projectId: project.id,
      sessionId: parentSessionId,
      sourceEntryIndex: 0,
      sourceEventId: note.id,
      sourceType: 'spec_note',
      status: 'COMPLETED',
      title: 'Implement spec wave',
    });
    const reviewTask = await createTask(sqlite, {
      assignedRole: 'GATE',
      kind: 'review',
      objective: 'Review the spec-derived change',
      projectId: project.id,
      sessionId: parentSessionId,
      sourceEntryIndex: 1,
      sourceEventId: note.id,
      sourceType: 'spec_note',
      status: 'PENDING',
      title: 'Review spec wave',
    });

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
        noteId: note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      },
    );

    expect(gateWave).toMatchObject({
      blockedTaskIds: [],
      dispatchedTaskIds: [reviewTask.id],
      gateTaskIds: [reviewTask.id],
      requiresGate: true,
      waveId: `twfg_${note.id}:gate`,
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
): TaskSessionDispatchCallbacks {
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
