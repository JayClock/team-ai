import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../../db/sqlite';
import type { AcpRuntimeClient } from '../../clients/acp-runtime-client';
import type { AcpStreamBroker } from '../../plugins/acp-stream';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import { readAgentConversation } from '../../services/acp-conversation-service';
import { applyFlowTemplate } from '../../services/apply-flow-template-service';
import {
  getOrCreateActiveDelegationGroup,
  registerDelegationGroupSession,
  registerDelegationGroupTask,
} from '../../services/delegation-group-service';
import { createProject } from '../../services/project-service';
import { createTask, listTasks, updateTask } from '../../services/task-service';
import { startTaskRun } from '../../services/task-run-service';
import { createReportToParentHandler } from './task-handlers';

describe('createReportToParentHandler', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
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
    const executeTask = vi.fn(async () => ({
      dispatch: {
        attempted: true,
        errorMessage: null,
        result: {
          dispatchability: {
            dispatchable: true,
            reasons: [],
            resolvedRole: 'GATE' as const,
            task: await updateTask(sqlite, gateTask.id, {
              assignedRole: 'GATE',
              status: 'READY',
            }),
            unresolvedDependencyIds: [],
          },
          dispatched: true,
          prompt: 'Review report flow',
          provider: 'codex',
          reason: null,
          role: 'GATE' as const,
          sessionId: 'acps_gate_auto',
          specialistId: 'gate-reviewer',
          task: await updateTask(sqlite, gateTask.id, {
            assignedRole: 'GATE',
            status: 'READY',
          }),
        },
      },
      task: await updateTask(sqlite, gateTask.id, {
        assignedRole: 'GATE',
        status: 'READY',
      }),
    }));

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
        taskWorkflowOrchestrator: {
          executeTask,
        },
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
    const initialTasks = await listTasks(sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: parentSessionId,
    });
    const implementTask = initialTasks.items.find((task) => task.kind === 'implement');
    const reviewTask = initialTasks.items.find((task) => task.kind === 'review');

    if (!implementTask || !reviewTask) {
      throw new Error('Expected spec-derived implement and review tasks');
    }

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
        taskWorkflowOrchestrator: {
          dispatchGateTasksForCompletedWave,
          executeTask: vi.fn(async () => {
            throw new Error('executeTask should not be used for spec gate wave handoff');
          }),
        },
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
        taskWorkflowOrchestrator: {
          dispatchGateTasksForCompletedWave: vi.fn(async () => {
            throw new Error('dispatchGateTasksForCompletedWave should not run');
          }),
          executeTask: vi.fn(async () => {
            throw new Error('executeTask should not run');
          }),
        },
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
