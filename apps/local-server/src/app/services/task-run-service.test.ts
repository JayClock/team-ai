import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { createProject } from './project-service';
import {
  cancelTaskRun,
  completeTaskRun,
  failTaskRun,
  getLatestTaskRunByTaskId,
  getRetryableTaskRunById,
  getTaskRunById,
  startTaskRun,
} from './task-run-service';
import { createTask } from './task-service';

describe('task run service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  let sessionCounter = 0;

  afterEach(async () => {
    sessionCounter = 0;

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('starts running task runs with execution metadata', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Run Lifecycle',
      repoPath: '/tmp/team-ai-task-run-service',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Implement task');
    const task = await createTask(sqlite, {
      objective: 'Track the initial execution attempt',
      projectId: project.id,
      title: 'Implement lifecycle helper',
      triggerSessionId: sessionId,
    });

    const taskRun = await startTaskRun(sqlite, {
      projectId: project.id,
      provider: 'opencode',
      role: 'CRAFTER',
      sessionId,
      summary: 'Child session bootstrapped',
      taskId: task.id,
      verificationVerdict: 'pending',
    });

    expect(taskRun).toMatchObject({
      kind: 'implement',
      isLatest: true,
      projectId: project.id,
      provider: 'opencode',
      retryOfRunId: null,
      role: 'CRAFTER',
      sessionId,
      status: 'RUNNING',
      summary: 'Child session bootstrapped',
      taskId: task.id,
      verificationVerdict: 'pending',
    });
    expect(taskRun.startedAt).toEqual(expect.any(String));
  });

  it('links retry runs to the previous run on the same task only', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Run Retry',
      repoPath: '/tmp/team-ai-task-run-retry',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Retry source');
    const retryTask = await createTask(sqlite, {
      objective: 'Retry a failed implementation',
      projectId: project.id,
      title: 'Retry task',
      triggerSessionId: sessionId,
    });
    const otherTask = await createTask(sqlite, {
      objective: 'Stay isolated from retry metadata',
      projectId: project.id,
      title: 'Other task',
      triggerSessionId: sessionId,
    });

    const firstRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId,
      taskId: retryTask.id,
    });
    await failTaskRun(sqlite, firstRun.id, {
      summary: 'Initial attempt failed',
      verificationVerdict: 'fail',
    });
    const retryRun = await startTaskRun(sqlite, {
      projectId: project.id,
      retryOfRunId: firstRun.id,
      sessionId,
      status: 'PENDING',
      taskId: retryTask.id,
    });
    const firstAttempt = await getTaskRunById(sqlite, firstRun.id);
    const latestTaskRun = await getLatestTaskRunByTaskId(sqlite, retryTask.id);

    expect(retryRun).toMatchObject({
      isLatest: true,
      retryOfRunId: firstRun.id,
      status: 'PENDING',
      taskId: retryTask.id,
    });
    expect(retryRun.startedAt).toBeNull();
    expect(firstAttempt).toMatchObject({
      id: firstRun.id,
      isLatest: false,
      status: 'FAILED',
    });
    expect(latestTaskRun).toMatchObject({
      id: retryRun.id,
      isLatest: true,
      retryOfRunId: firstRun.id,
    });
    await expect(
      getRetryableTaskRunById(sqlite, firstRun.id),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-run-retry-source-not-latest',
    });

    await expect(
      startTaskRun(sqlite, {
        projectId: project.id,
        retryOfRunId: firstRun.id,
        sessionId,
        taskId: otherTask.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/task-run-retry-task-mismatch',
    });
  });

  it('completes task runs with unified resolution fields', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Run Completion',
      repoPath: '/tmp/team-ai-task-run-complete',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Initial execution');
    const completionSessionId = createAcpSession(
      sqlite,
      project.id,
      'Completion result',
    );
    const task = await createTask(sqlite, {
      objective: 'Capture a successful execution summary',
      projectId: project.id,
      title: 'Completion task',
      triggerSessionId: sessionId,
    });
    const taskRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId,
      taskId: task.id,
    });

    const completedRun = await completeTaskRun(sqlite, taskRun.id, {
      provider: 'opencode',
      role: 'GATE',
      sessionId: completionSessionId,
      summary: 'Verification passed and output accepted',
      verificationReport: 'lint, test, and build passed',
      verificationVerdict: 'pass',
    });

    expect(completedRun).toMatchObject({
      id: taskRun.id,
      provider: 'opencode',
      role: 'GATE',
      sessionId: completionSessionId,
      status: 'COMPLETED',
      summary: 'Verification passed and output accepted',
      verificationReport: 'lint, test, and build passed',
      verificationVerdict: 'pass',
    });
    expect(completedRun.completedAt).toEqual(expect.any(String));
  });

  it('fails and cancels task runs through terminal lifecycle helpers', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Task Run Failure',
      repoPath: '/tmp/team-ai-task-run-failure',
    });
    const sessionId = createAcpSession(sqlite, project.id, 'Execution session');
    const task = await createTask(sqlite, {
      objective: 'Exercise failed and cancelled outcomes',
      projectId: project.id,
      title: 'Terminal states task',
      triggerSessionId: sessionId,
    });
    const failedRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId,
      taskId: task.id,
    });
    const pendingRun = await startTaskRun(sqlite, {
      projectId: project.id,
      sessionId,
      status: 'PENDING',
      taskId: task.id,
    });

    const updatedFailedRun = await failTaskRun(sqlite, failedRun.id, {
      summary: 'The provider returned a fatal error',
      verificationVerdict: 'fail',
    });
    const cancelledRun = await cancelTaskRun(sqlite, pendingRun.id, {
      summary: 'Execution was cancelled before work started',
    });

    expect(updatedFailedRun).toMatchObject({
      id: failedRun.id,
      status: 'FAILED',
      summary: 'The provider returned a fatal error',
      verificationVerdict: 'fail',
    });
    expect(updatedFailedRun.completedAt).toEqual(expect.any(String));

    expect(cancelledRun).toMatchObject({
      id: pendingRun.id,
      startedAt: null,
      status: 'CANCELLED',
      summary: 'Execution was cancelled before work started',
    });
    expect(cancelledRun.completedAt).toEqual(expect.any(String));
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-run-service-'));
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

  function createAcpSession(
    sqlite: Database,
    projectId: string,
    title: string,
  ) {
    sessionCounter += 1;
    const sessionId = `acps_task_run_${sessionCounter}`;

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-run-service',
      id: sessionId,
      name: title,
      projectId,
    });

    return sessionId;
  }
});
