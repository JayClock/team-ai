import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskExecutionRuntime } from './task-execution-runtime-service';
import { initializeDatabase } from '../db/sqlite';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { applyFlowTemplate } from './apply-flow-template-service';
import { createProject } from './project-service';
import { listTasks, updateTask } from './task-service';
import { createTaskWorkflowOrchestrator } from './task-workflow-orchestrator-service';

describe('task workflow orchestrator service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('syncs the canonical spec note and dispatches the implement wave through the shared dispatch chain', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-workflow-orchestrator',
      title: 'Task Workflow Orchestrator',
    });
    const parentSessionId = 'acps_workflow_parent';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-workflow-orchestrator',
      id: parentSessionId,
      name: 'Workflow parent',
      projectId: project.id,
      provider: 'codex',
    });

    const applied = await applyFlowTemplate(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
      templateId: 'routa-spec-loop',
    });

    let childSessionCount = 0;
    const runtime = createTestRuntime(sqlite, project.id, parentSessionId, () => {
      childSessionCount += 1;
      return `acps_workflow_child_${childSessionCount}`;
    });
    const orchestrator = createTaskWorkflowOrchestrator({
      executionRuntime: runtime,
      sqlite,
    });

    const result = await orchestrator.syncSpecAndDispatchReadyTasks({
      callerSessionId: parentSessionId,
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

    expect(result).toMatchObject({
      blockedTaskIds: [],
      dispatchedTaskIds: expect.arrayContaining([expect.any(String)]),
      gateTaskIds: expect.arrayContaining([expect.any(String)]),
      requiresGate: false,
      scope: {
        noteId: applied.note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      },
      taskSync: expect.objectContaining({
        createdCount: 0,
        parsedCount: 2,
        updatedCount: 2,
      }),
      waveId: `twfg_${applied.note.id}:implement`,
      waveKind: 'implement',
    });

    const tasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const implementTask = tasks.items.find((task) => task.kind === 'implement');
    const reviewTask = tasks.items.find((task) => task.kind === 'review');

    expect(implementTask).toMatchObject({
      assignedRole: 'CRAFTER',
      status: 'READY',
      triggerSessionId: 'acps_workflow_child_1',
    });
    expect(reviewTask).toMatchObject({
      assignedRole: 'GATE',
      status: 'PENDING',
      triggerSessionId: null,
    });
  });

  it('resumes a completed implement group and dispatches the gate wave', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-workflow-gate',
      title: 'Task Workflow Gate',
    });
    const parentSessionId = 'acps_workflow_gate_parent';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-workflow-gate',
      id: parentSessionId,
      name: 'Workflow gate parent',
      projectId: project.id,
      provider: 'codex',
    });

    const applied = await applyFlowTemplate(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
      templateId: 'routa-spec-loop',
    });

    let childSessionCount = 0;
    const runtime = createTestRuntime(sqlite, project.id, parentSessionId, () => {
      childSessionCount += 1;
      return `acps_workflow_gate_child_${childSessionCount}`;
    });
    const orchestrator = createTaskWorkflowOrchestrator({
      executionRuntime: runtime,
      sqlite,
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

    const resumed = await orchestrator.resumeDelegationGroup({
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

    expect(resumed).toMatchObject({
      completedTaskIds: [],
      gateTaskIds: [reviewTask.id],
      pendingTaskIds: [reviewTask.id],
      requiresGate: true,
      scope: {
        noteId: applied.note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      },
      waveId: `twfg_${applied.note.id}:gate`,
      waveKind: 'gate',
    });

    const gateWave = await orchestrator.dispatchGateTasksForCompletedWave({
      callerSessionId: parentSessionId,
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

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
      triggerSessionId: 'acps_workflow_gate_child_1',
    });
  });

  it('covers the spec sync, implement wave, and gate wave lifecycle in a single flow', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-workflow-full-chain',
      title: 'Task Workflow Full Chain',
    });
    const parentSessionId = 'acps_workflow_full_parent';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-workflow-full-chain',
      id: parentSessionId,
      name: 'Workflow full parent',
      projectId: project.id,
      provider: 'codex',
    });

    const applied = await applyFlowTemplate(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
      templateId: 'routa-spec-loop',
    });

    let childSessionCount = 0;
    const runtime = createTestRuntime(sqlite, project.id, parentSessionId, () => {
      childSessionCount += 1;
      return `acps_workflow_full_child_${childSessionCount}`;
    });
    const orchestrator = createTaskWorkflowOrchestrator({
      executionRuntime: runtime,
      sqlite,
    });

    const implementWave = await orchestrator.syncSpecAndDispatchReadyTasks({
      callerSessionId: parentSessionId,
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

    const syncedTasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const implementTask = syncedTasks.items.find((task) => task.kind === 'implement');
    const reviewTask = syncedTasks.items.find((task) => task.kind === 'review');

    if (!implementTask || !reviewTask) {
      throw new Error('Expected spec-derived implement and review tasks');
    }

    expect(implementWave).toMatchObject({
      dispatchedTaskIds: [implementTask.id],
      gateTaskIds: [reviewTask.id],
      requiresGate: false,
      waveId: `twfg_${applied.note.id}:implement`,
      waveKind: 'implement',
    });
    expect(implementTask.triggerSessionId).toBe('acps_workflow_full_child_1');
    expect(reviewTask.status).toBe('PENDING');

    await updateTask(sqlite, implementTask.id, {
      completionSummary: 'Implemented in the full spec workflow',
      resultSessionId: implementTask.triggerSessionId,
      status: 'COMPLETED',
      verificationVerdict: 'pass',
    });

    const resumedWave = await orchestrator.resumeDelegationGroup({
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

    expect(resumedWave).toMatchObject({
      gateTaskIds: [reviewTask.id],
      pendingTaskIds: [reviewTask.id],
      readyTaskIds: [],
      requiresGate: true,
      waveId: `twfg_${applied.note.id}:gate`,
      waveKind: 'gate',
    });

    const gateWave = await orchestrator.dispatchGateTasksForCompletedWave({
      callerSessionId: parentSessionId,
      noteId: applied.note.id,
      projectId: project.id,
      sessionId: parentSessionId,
    });

    expect(gateWave).toMatchObject({
      blockedTaskIds: [],
      dispatchedTaskIds: [reviewTask.id],
      gateTaskIds: [reviewTask.id],
      requiresGate: true,
      waveId: `twfg_${applied.note.id}:gate`,
      waveKind: 'gate',
    });

    const finalTasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const finalReviewTask = finalTasks.items.find((task) => task.id === reviewTask.id);

    expect(finalReviewTask).toMatchObject({
      assignedRole: 'GATE',
      status: 'READY',
      triggerSessionId: 'acps_workflow_full_child_2',
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-workflow-'));
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
