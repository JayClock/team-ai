import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { listNotes } from './note-service';
import { createProject } from './project-service';
import { reportToParent } from './task-report-service';
import { startTaskRun } from './task-run-service';
import { createTask, updateTask } from './task-service';

describe('task report service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('records an implementation child report into note, task, and task run state', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Implementation Report',
      repoPath: '/tmp/team-ai-task-report-implementation',
    });
    const rootSessionId = 'acps_task_report_root_impl';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-implementation',
      id: rootSessionId,
      projectId: project.id,
    });
    const task = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Capture structured crafter completion evidence',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Implement report loop',
    });
    const childSessionId = 'acps_task_report_child_impl';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-implementation',
      id: childSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      taskId: task.id,
    });
    await updateTask(sqlite, task.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: childSessionId,
      status: 'RUNNING',
      taskId: task.id,
    });

    const result = await reportToParent(sqlite, {
      filesChanged: ['apps/local-server/src/app/routes/mcp.ts'],
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Implemented the report_to_parent MCP workflow',
      verificationPerformed: ['npx nx test local-server --runTestsByPath mcp'],
      verdict: 'completed',
    });

    expect(result).toMatchObject({
      noteAction: 'created',
      note: {
        linkedTaskId: task.id,
        sessionId: rootSessionId,
        title: 'Task Report: Implement report loop',
        type: 'task',
      },
      report: {
        mode: 'implementation',
        parentSessionId: rootSessionId,
        taskId: task.id,
        verdict: 'completed',
      },
      task: {
        completionSummary: 'Implemented the report_to_parent MCP workflow',
        executionSessionId: null,
        resultSessionId: childSessionId,
        status: 'COMPLETED',
      },
      taskRun: {
        sessionId: childSessionId,
        status: 'COMPLETED',
        summary: 'Implemented the report_to_parent MCP workflow',
      },
    });
    expect(result.note.content).toContain('### Files Changed');
    expect(result.note.content).toContain('### Verification Performed');
  });

  it('records a successful gate report as a verification outcome', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Verification Pass Report',
      repoPath: '/tmp/team-ai-task-report-gate-pass',
    });
    const rootSessionId = 'acps_task_report_root_gate_pass';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-gate-pass',
      id: rootSessionId,
      projectId: project.id,
    });
    const task = await createTask(sqlite, {
      kind: 'review',
      objective: 'Persist gate approval evidence',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Review report loop',
    });
    const childSessionId = 'acps_task_report_child_gate_pass';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-gate-pass',
      id: childSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      taskId: task.id,
    });
    await updateTask(sqlite, task.id, {
      assignedRole: 'GATE',
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'GATE',
      sessionId: childSessionId,
      status: 'RUNNING',
      taskId: task.id,
    });

    const result = await reportToParent(sqlite, {
      areasChanged: ['MCP route', 'task report service'],
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Verification passed for the reporting workflow',
      verificationPerformed: [
        'npx nx test local-server --runTestsByPath task-report-service',
      ],
      verdict: 'pass',
    });

    expect(result).toMatchObject({
      noteAction: 'created',
      note: {
        linkedTaskId: task.id,
        sessionId: rootSessionId,
        title: 'Verification Report: Review report loop',
        type: 'general',
      },
      report: {
        mode: 'verification',
        parentSessionId: rootSessionId,
        taskId: task.id,
        verdict: 'pass',
      },
      task: {
        executionSessionId: null,
        resultSessionId: childSessionId,
        status: 'COMPLETED',
        verificationVerdict: 'pass',
      },
      taskRun: {
        sessionId: childSessionId,
        status: 'COMPLETED',
        verificationVerdict: 'pass',
      },
    });
    expect(result.task.verificationReport).toContain('### Verification Performed');
  });

  it('marks verification failures as retryable and appends to the same note', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Verification Fail Report',
      repoPath: '/tmp/team-ai-task-report-gate-fail',
    });
    const rootSessionId = 'acps_task_report_root_gate_fail';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-gate-fail',
      id: rootSessionId,
      projectId: project.id,
    });
    const task = await createTask(sqlite, {
      kind: 'verify',
      objective: 'Persist gate rejection evidence',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Verify report loop',
    });
    const childSessionId = 'acps_task_report_child_gate_fail';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-gate-fail',
      id: childSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      taskId: task.id,
    });
    await updateTask(sqlite, task.id, {
      assignedRole: 'GATE',
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'GATE',
      sessionId: childSessionId,
      status: 'RUNNING',
      taskId: task.id,
    });

    await reportToParent(sqlite, {
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Verification found a failing regression test',
      verdict: 'fail',
      verificationPerformed: ['pnpm vitest apps/local-server/src/app/routes/mcp.test.ts'],
    });
    const secondResult = await reportToParent(sqlite, {
      blocker: 'Regression remains unresolved in report_to_parent',
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Verification still failing after retry review',
      verdict: 'fail',
      verificationPerformed: ['pnpm vitest apps/local-server/src/app/services/task-report-service.test.ts'],
    });

    const notes = await listNotes(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: rootSessionId,
      type: 'general',
    });

    expect(secondResult).toMatchObject({
      noteAction: 'updated',
      report: {
        mode: 'verification',
        parentSessionId: rootSessionId,
        taskId: task.id,
        verdict: 'fail',
      },
      task: {
        resultSessionId: childSessionId,
        status: 'WAITING_RETRY',
        verificationVerdict: 'fail',
      },
      taskRun: {
        sessionId: childSessionId,
        status: 'FAILED',
        verificationVerdict: 'fail',
      },
    });
    expect(notes.items).toHaveLength(1);
    expect(notes.items[0].content).toContain('Verification found a failing regression test');
    expect(notes.items[0].content).toContain('Verification still failing after retry review');
  });

  it('rejects reports from sessions without a parent workflow context', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      title: 'Invalid Report Context',
      repoPath: '/tmp/team-ai-task-report-invalid',
    });
    const sessionId = 'acps_task_report_invalid';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-report-invalid',
      id: sessionId,
      projectId: project.id,
    });

    await expect(
      reportToParent(sqlite, {
        projectId: project.id,
        sessionId,
        summary: 'This should fail',
        verdict: 'completed',
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'https://team-ai.dev/problems/report-session-context-missing',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-report-'));
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
