import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AcpRuntimeClient,
  AcpStreamBroker,
} from '@orchestration/runtime-acp';
import { initializeDatabase } from '../../db/sqlite';
import { getTaskWorkflowRuntime } from '../task-workflow-runtime';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import { readAgentConversation } from '../../services/acp-conversation-service';
import { applyFlowTemplate } from '../../services/apply-flow-template-service';
import {
  getOrCreateActiveDelegationGroup,
  registerDelegationGroupSession,
  registerDelegationGroupTask,
} from '../../services/delegation-group-service';
import { createProject } from '../../services/project-service';
import { createTask, updateTask } from '../../services/task-service';
import { startTaskRun } from '../../services/task-run-service';
import { createReportToParentHandler } from './task-handlers';

vi.mock('../task-workflow-runtime', () => ({
  getTaskWorkflowRuntime: vi.fn(),
}));

describe('createReportToParentHandler', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.mocked(getTaskWorkflowRuntime).mockReset();

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('records child completion orchestration events and deduplicates parent wake prompts', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-handler-report',
      title: 'Task Handler Report',
    });
    const parentSessionId = 'acps_handler_parent';
    const childSessionId = 'acps_handler_child';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-report',
      id: parentSessionId,
      projectId: project.id,
      provider: 'codex',
    });
    const implementationTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Implement the scoped report flow',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'Implement report flow',
    });
    const gateTask = await createTask(sqlite, {
      dependencies: [implementationTask.id],
      kind: 'review',
      objective: 'Review the scoped report flow',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'PENDING',
      title: 'Review report flow',
    });

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-report',
      id: childSessionId,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: implementationTask.id,
    });
    await updateTask(sqlite, implementationTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: childSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: childSessionId,
      status: 'RUNNING',
      taskId: implementationTask.id,
    });

    const promptSession = vi.fn(async () => ({
      response: { stopReason: 'end_turn' as const },
      runtimeSessionId: 'runtime-report',
    }));
    const patchTaskFromMcpAndMaybeExecute = vi.fn(async () => {
      insertAcpSession(sqlite, {
        cwd: '/tmp/team-ai-task-handler-report',
        id: 'acps_gate_auto',
        parentSessionId,
        projectId: project.id,
        provider: 'codex',
        taskId: gateTask.id,
      });

      return await updateTask(sqlite, gateTask.id, {
        assignedRole: 'GATE',
        status: 'READY',
        triggerSessionId: 'acps_gate_auto',
      });
    });

    vi.mocked(getTaskWorkflowRuntime).mockReturnValue({
      patchTaskFromMcpAndMaybeExecute,
    } as ReturnType<typeof getTaskWorkflowRuntime>);

    const handler = createReportToParentHandler(
      {
        acpRuntime: {
          isSessionActive: vi.fn(() => true),
          promptSession,
        } as Pick<AcpRuntimeClient, 'isSessionActive' | 'promptSession'>,
        acpStreamBroker: {
          publish: vi.fn(),
        } as unknown as AcpStreamBroker,
        log: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        } as unknown as FastifyBaseLogger,
        sqlite,
      } as FastifyInstance,
    );

    const firstResult = await handler({
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Implemented the downstream report flow',
      verdict: 'completed',
    });

    expect(firstResult).toMatchObject({
      autoHandoff: [
        expect.objectContaining({
          dispatched: true,
          taskId: gateTask.id,
        }),
      ],
      wake: {
        delivered: true,
        mode: 'immediate',
        reason: null,
      },
    });
    expect(promptSession).toHaveBeenCalledTimes(1);

    const parentConversation = await readAgentConversation(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const childConversation = await readAgentConversation(sqlite, {
      projectId: project.id,
      sessionId: childSessionId,
    });

    expect(parentConversation.projection.orchestrationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'gate_required',
          parentSessionId,
          taskId: implementationTask.id,
          taskIds: [gateTask.id],
        }),
        expect.objectContaining({
          eventName: 'parent_session_resume_requested',
          parentSessionId,
          taskId: implementationTask.id,
          wakeDelivered: true,
        }),
      ]),
    );
    expect(childConversation.projection.orchestrationEvents).toEqual([
      expect.objectContaining({
        childSessionId,
        eventName: 'child_session_completed',
        parentSessionId,
        taskId: implementationTask.id,
      }),
    ]);

    const duplicateResult = await handler({
      projectId: project.id,
      sessionId: childSessionId,
      summary: 'Implemented the downstream report flow again',
      verdict: 'completed',
    });

    expect(duplicateResult.wake).toMatchObject({
      delivered: false,
      mode: 'immediate',
      reason: 'resume_already_requested',
    });
    expect(promptSession).toHaveBeenCalledTimes(1);
  });

  it('auto-dispatches a spec gate wave and creates a fix task after gate failure', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-handler-spec-wave',
      title: 'Task Handler Spec Wave',
    });
    const parentSessionId = 'acps_handler_spec_parent';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-spec-wave',
      id: parentSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const applied = await applyFlowTemplate(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
      templateId: 'routa-spec-loop',
    });
    const implementTask = await createTask(sqlite, {
      assignedRole: 'CRAFTER',
      kind: 'implement',
      objective: 'Implement the delivery slice',
      projectId: project.id,
      sessionId: parentSessionId,
      sourceEntryIndex: 0,
      sourceEventId: applied.note.id,
      sourceType: 'spec_note',
      status: 'READY',
      title: 'Implement the delivery slice',
    });
    const reviewTask = await createTask(sqlite, {
      assignedRole: 'GATE',
      dependencies: [implementTask.id],
      kind: 'review',
      objective: 'Review the delivery slice',
      projectId: project.id,
      sessionId: parentSessionId,
      sourceEntryIndex: 1,
      sourceEventId: applied.note.id,
      sourceType: 'spec_note',
      status: 'PENDING',
      title: 'Review the delivery slice',
    });

    const implementationSessionId = 'acps_handler_spec_impl_child';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-spec-wave',
      id: implementationSessionId,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: implementTask.id,
    });
    await updateTask(sqlite, implementTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: implementationSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: implementationSessionId,
      status: 'RUNNING',
      taskId: implementTask.id,
    });

    const promptSession = vi.fn(async () => ({
      response: { stopReason: 'end_turn' as const },
      runtimeSessionId: 'runtime-spec-wave',
    }));
    const dispatchGateTasksForCompletedWave = vi.fn(async () => ({
      blockedTaskIds: [],
      completedTaskIds: [],
      delegationGroupId: `twfg_${applied.note.id}`,
      dispatchResults: [
        {
          dispatchability: {
            dispatchable: true,
            reasons: [],
            resolvedRole: 'GATE' as const,
            task: await updateTask(sqlite, reviewTask.id, {
              assignedRole: 'GATE',
              status: 'READY',
            }),
            unresolvedDependencyIds: [],
          },
          dispatched: true,
          prompt: 'Review the delivery slice',
          provider: 'codex',
          reason: null,
          role: 'GATE' as const,
          sessionId: 'acps_handler_spec_gate_child',
          specialistId: 'gate-reviewer',
          task: await updateTask(sqlite, reviewTask.id, {
            assignedRole: 'GATE',
            status: 'READY',
          }),
        },
      ],
      dispatchedTaskIds: [reviewTask.id],
      gateTaskIds: [reviewTask.id],
      pendingTaskIds: [],
      readyTaskIds: [reviewTask.id],
      requiresGate: true,
      scope: {
        noteId: applied.note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      },
      syncedTaskIds: [implementTask.id, reviewTask.id],
      waveId: `twfg_${applied.note.id}:gate`,
      waveKind: 'gate' as const,
    }));

    vi.mocked(getTaskWorkflowRuntime).mockReturnValue({
      dispatchGateTasksForCompletedWave,
      patchTaskFromMcpAndMaybeExecute: vi.fn(async () => {
        throw new Error(
          'patchTaskFromMcpAndMaybeExecute should not be used for spec gate wave handoff',
        );
      }),
    } as ReturnType<typeof getTaskWorkflowRuntime>);

    const handler = createReportToParentHandler(
      {
        acpRuntime: {
          isSessionActive: vi.fn(() => true),
          promptSession,
        } as Pick<AcpRuntimeClient, 'isSessionActive' | 'promptSession'>,
        acpStreamBroker: {
          publish: vi.fn(),
        } as unknown as AcpStreamBroker,
        log: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        } as unknown as FastifyBaseLogger,
        sqlite,
      } as FastifyInstance,
    );

    const implementationResult = await handler({
      projectId: project.id,
      sessionId: implementationSessionId,
      summary: 'Implementation completed for the spec wave',
      verdict: 'completed',
    });

    expect(implementationResult.autoHandoff).toEqual([
      expect.objectContaining({
        dispatched: true,
        taskId: reviewTask.id,
        title: 'Review the delivery slice',
      }),
    ]);
    expect(dispatchGateTasksForCompletedWave).toHaveBeenCalledWith(
      expect.objectContaining({
        callerSessionId: parentSessionId,
        noteId: applied.note.id,
        projectId: project.id,
        sessionId: parentSessionId,
      }),
    );

    const reviewSessionId = 'acps_handler_spec_gate_child';
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-spec-wave',
      id: reviewSessionId,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: reviewTask.id,
    });
    await updateTask(sqlite, reviewTask.id, {
      assignedRole: 'GATE',
      executionSessionId: reviewSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'GATE',
      sessionId: reviewSessionId,
      status: 'RUNNING',
      taskId: reviewTask.id,
    });

    const gateFailureResult = await handler({
      projectId: project.id,
      sessionId: reviewSessionId,
      summary: 'Gate found a regression that needs a follow-up fix',
      verdict: 'fail',
    });

    expect(gateFailureResult.autoFix).toMatchObject({
      created: true,
      task: {
        assignedRole: 'CRAFTER',
        kind: 'implement',
        parentTaskId: reviewTask.id,
        sessionId: parentSessionId,
        status: 'READY',
        title: 'Fix: Review the delivery slice',
      },
    });
  });

  it('waits for an after_all delegation group barrier before waking the parent session', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-task-handler-after-all',
      title: 'Task Handler After All',
    });
    const parentSessionId = 'acps_handler_after_all_parent';
    const childSessionA = 'acps_handler_after_all_child_a';
    const childSessionB = 'acps_handler_after_all_child_b';

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-after-all',
      id: parentSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const firstTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Implement the first grouped slice',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'Implement grouped slice A',
    });
    const secondTask = await createTask(sqlite, {
      kind: 'implement',
      objective: 'Implement the second grouped slice',
      projectId: project.id,
      sessionId: parentSessionId,
      status: 'READY',
      title: 'Implement grouped slice B',
    });

    const delegationGroup = await getOrCreateActiveDelegationGroup(sqlite, {
      callerSessionId: parentSessionId,
      projectId: project.id,
    });

    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-after-all',
      id: childSessionA,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: firstTask.id,
    });
    insertAcpSession(sqlite, {
      cwd: '/tmp/team-ai-task-handler-after-all',
      id: childSessionB,
      parentSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: secondTask.id,
    });

    await updateTask(sqlite, firstTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: childSessionA,
      parallelGroup: delegationGroup.id,
      status: 'RUNNING',
    });
    await updateTask(sqlite, secondTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: childSessionB,
      parallelGroup: delegationGroup.id,
      status: 'RUNNING',
    });
    await registerDelegationGroupTask(sqlite, {
      groupId: delegationGroup.id,
      taskId: firstTask.id,
    });
    await registerDelegationGroupTask(sqlite, {
      groupId: delegationGroup.id,
      taskId: secondTask.id,
    });
    await registerDelegationGroupSession(sqlite, {
      groupId: delegationGroup.id,
      sessionId: childSessionA,
      taskId: firstTask.id,
    });
    await registerDelegationGroupSession(sqlite, {
      groupId: delegationGroup.id,
      sessionId: childSessionB,
      taskId: secondTask.id,
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: childSessionA,
      status: 'RUNNING',
      taskId: firstTask.id,
    });
    await startTaskRun(sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: childSessionB,
      status: 'RUNNING',
      taskId: secondTask.id,
    });

    const promptSession = vi.fn(async () => ({
      response: { stopReason: 'end_turn' as const },
      runtimeSessionId: 'runtime-after-all',
    }));
    vi.mocked(getTaskWorkflowRuntime).mockReturnValue({
      dispatchGateTasksForCompletedWave: vi.fn(async () => {
        throw new Error('dispatchGateTasksForCompletedWave should not run');
      }),
      patchTaskFromMcpAndMaybeExecute: vi.fn(async () => {
        throw new Error('patchTaskFromMcpAndMaybeExecute should not run');
      }),
    } as ReturnType<typeof getTaskWorkflowRuntime>);

    const handler = createReportToParentHandler(
      {
        acpRuntime: {
          isSessionActive: vi.fn(() => true),
          promptSession,
        } as Pick<AcpRuntimeClient, 'isSessionActive' | 'promptSession'>,
        acpStreamBroker: {
          publish: vi.fn(),
        } as unknown as AcpStreamBroker,
        log: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        } as unknown as FastifyBaseLogger,
        sqlite,
      } as FastifyInstance,
    );

    const firstResult = await handler({
      projectId: project.id,
      sessionId: childSessionA,
      summary: 'Completed grouped slice A',
      verdict: 'completed',
    });

    expect(firstResult.wake).toMatchObject({
      delivered: false,
      mode: 'after_all',
      reason: 'waiting_for_group_barrier',
    });
    expect(promptSession).not.toHaveBeenCalled();

    const secondResult = await handler({
      projectId: project.id,
      sessionId: childSessionB,
      summary: 'Completed grouped slice B',
      verdict: 'completed',
    });

    expect(secondResult.wake).toMatchObject({
      delivered: true,
      mode: 'after_all',
      reason: null,
    });
    expect(promptSession).toHaveBeenCalledTimes(1);
    expect(promptSession).toHaveBeenCalledWith(
      expect.objectContaining({
        localSessionId: parentSessionId,
        prompt: expect.stringContaining('Delegation Group Complete'),
      }),
    );

    const parentConversation = await readAgentConversation(sqlite, {
      projectId: project.id,
      sessionId: parentSessionId,
    });

    expect(parentConversation.projection.orchestrationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delegationGroupId: delegationGroup.id,
          eventName: 'delegation_group_completed',
          parentSessionId,
          taskIds: expect.arrayContaining([firstTask.id, secondTask.id]),
        }),
        expect.objectContaining({
          delegationGroupId: delegationGroup.id,
          eventName: 'parent_session_resume_requested',
          parentSessionId,
          taskIds: expect.arrayContaining([firstTask.id, secondTask.id]),
          wakeDelivered: true,
        }),
      ]),
    );
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>): Promise<Database> {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-task-handler-'));
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
