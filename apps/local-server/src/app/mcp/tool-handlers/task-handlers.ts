import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logDiagnostic } from '../../diagnostics';
import {
  hasAcpSessionEvent,
  recordAcpOrchestrationEvent,
} from '../../services/acp-service';
import { listDelegationGroupTasks } from '../../services/delegation-group-service';
import { getProjectById } from '../../services/project-service';
import { reportToParent } from '../../services/task-report-service';
import { taskOrchestrationEventNames } from '../../services/task-orchestration-events';
import { listTaskRuns } from '../../services/task-run-service';
import {
  createTask,
  getTaskById,
  listDependentTasks,
  listTasks,
  updateTask,
} from '../../services/task-service';
import {
  reportToParentArgsSchema,
  taskExecuteArgsSchema,
  taskGetArgsSchema,
  taskRunsListArgsSchema,
  tasksListArgsSchema,
  taskUpdateArgsSchema,
} from '../contracts';
import {
  ensureDependencyTasksBelongToProject,
  getProjectSession,
  getProjectTask,
} from '../utils';

type TasksListArgs = z.infer<typeof tasksListArgsSchema>;
type TaskGetArgs = z.infer<typeof taskGetArgsSchema>;
type TaskUpdateArgs = z.infer<typeof taskUpdateArgsSchema>;
type TaskExecuteArgs = z.infer<typeof taskExecuteArgsSchema>;
type TaskRunsListArgs = z.infer<typeof taskRunsListArgsSchema>;
type ReportToParentArgs = z.infer<typeof reportToParentArgsSchema>;

function requireTaskWorkflowOrchestrator(fastify: FastifyInstance) {
  if (!fastify.hasDecorator('taskWorkflowOrchestrator')) {
    throw new Error(
      'Legacy task workflow orchestration is disabled in the main runtime',
    );
  }

  return fastify.taskWorkflowOrchestrator;
}

export function createTasksListHandler(fastify: FastifyInstance) {
  return async (args: TasksListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    if (args.sessionId) {
      await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    }

    return listTasks(fastify.sqlite, args);
  };
}

export function createTaskGetHandler(fastify: FastifyInstance) {
  return async (args: TaskGetArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);

    return {
      task: await getProjectTask(fastify.sqlite, args.projectId, args.taskId),
    };
  };
}

export function createTaskUpdateHandler(fastify: FastifyInstance) {
  return async (args: TaskUpdateArgs) => {
    const workflow = requireTaskWorkflowOrchestrator(fastify);

    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
    await ensureDependencyTasksBelongToProject(
      fastify.sqlite,
      args.projectId,
      args.dependencies,
    );

    const { projectId, taskId, ...patch } = args;
    void projectId;

    return {
      task: await workflow.patchTaskFromMcpAndMaybeExecute(taskId, patch, {
        logger: fastify.log,
        source: 'mcp_task_update_auto_execute',
      }),
    };
  };
}

export function createTaskExecuteHandler(fastify: FastifyInstance) {
  return async (args: TaskExecuteArgs) => {
    const workflow = requireTaskWorkflowOrchestrator(fastify);

    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);

    return workflow.executeTask(args.taskId, {
      callerSessionId: args.callerSessionId,
      logger: fastify.log,
      source: 'mcp_task_execute',
    });
  };
}

export function createTaskRunsListHandler(fastify: FastifyInstance) {
  return async (args: TaskRunsListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    if (args.taskId) {
      await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
    }
    if (args.sessionId) {
      await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    }

    return listTaskRuns(fastify.sqlite, args);
  };
}

export function createReportToParentHandler(fastify: FastifyInstance) {
  return async (args: ReportToParentArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    const childSession = await getProjectSession(
      fastify.sqlite,
      args.projectId,
      args.sessionId,
    );
    const result = await reportToParent(fastify.sqlite, args);
    const autoHandoff =
      result.report.mode === 'implementation' && result.report.verdict === 'completed'
        ? await autoDispatchGateFollowUps(fastify, result.task)
        : [];
    const autoFix =
      result.report.mode === 'verification' && result.report.verdict === 'fail'
        ? await ensureFixFollowUpTask(fastify, result.task, args.summary)
        : null;
    await emitReportOrchestrationEvents(fastify, {
      autoHandoff,
      childSessionId: childSession.id,
      delegationGroup: result.delegationGroup,
      parentSessionId: result.report.parentSessionId,
      task: result.task,
    });
    const wake = await maybeWakeParentSession(fastify, {
      childSessionId: childSession.id,
      delegationGroup: result.delegationGroup,
      noteId: result.note.id,
      parentSessionId: result.report.parentSessionId,
      projectId: args.projectId,
      task: result.task,
    });

    return {
      ...result,
      autoHandoff,
      autoFix,
      wake,
    };
  };
}

async function emitReportOrchestrationEvents(
  fastify: FastifyInstance,
  input: {
    autoHandoff: Array<{
      dispatched: boolean;
      error: string | null;
      status: string;
      taskId: string;
      title: string;
    }>;
    childSessionId: string;
    delegationGroup: {
      completedCount: number;
      failureCount: number;
      groupId: string;
      parentSessionId: string | null;
      pendingCount: number;
      sessionIds: string[];
      settled: boolean;
      status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      taskIds: string[];
      totalCount: number;
    } | null;
    parentSessionId: string | null;
    task: Awaited<ReturnType<typeof getProjectTask>>;
  },
) {
  recordAcpOrchestrationEvent(fastify.sqlite, fastify.acpStreamBroker, {
    childSessionId: input.childSessionId,
    eventId: `orch_child_complete_${input.childSessionId}`,
    eventName: 'child_session_completed',
    parentSessionId: input.parentSessionId,
    sessionId: input.childSessionId,
    taskId: input.task.id,
    taskIds: [input.task.id],
  });

  logDiagnostic(
    fastify.log,
    'info',
    {
      childSessionId: input.childSessionId,
      event: taskOrchestrationEventNames.childSessionCompleted,
      parentSessionId: input.parentSessionId,
      taskId: input.task.id,
    },
    'Recorded child session completion orchestration event',
  );

  if (input.parentSessionId && input.delegationGroup?.settled) {
    recordAcpOrchestrationEvent(fastify.sqlite, fastify.acpStreamBroker, {
      childSessionId: input.childSessionId,
      delegationGroupId: input.delegationGroup.groupId,
      eventId: `orch_group_complete_${input.delegationGroup.groupId}`,
      eventName: 'delegation_group_completed',
      parentSessionId: input.parentSessionId,
      sessionId: input.parentSessionId,
      taskId: input.task.id,
      taskIds: input.delegationGroup.taskIds,
    });

    logDiagnostic(
      fastify.log,
      'info',
      {
        event: taskOrchestrationEventNames.delegationGroupCompleted,
        groupId: input.delegationGroup.groupId,
        parentSessionId: input.parentSessionId,
      },
      'Recorded delegation group completion orchestration event',
    );
  }

  const gateTaskIds = input.autoHandoff.map((item) => item.taskId);
  if (input.parentSessionId && gateTaskIds.length > 0) {
    recordAcpOrchestrationEvent(fastify.sqlite, fastify.acpStreamBroker, {
      childSessionId: input.childSessionId,
      delegationGroupId: input.delegationGroup?.groupId ?? null,
      eventId: `orch_gate_required_${input.task.id}`,
      eventName: 'gate_required',
      parentSessionId: input.parentSessionId,
      sessionId: input.parentSessionId,
      taskId: input.task.id,
      taskIds: gateTaskIds,
    });

    logDiagnostic(
      fastify.log,
      'info',
      {
        event: taskOrchestrationEventNames.gateRequired,
        parentSessionId: input.parentSessionId,
        taskId: input.task.id,
        taskIds: gateTaskIds,
      },
      'Recorded gate handoff orchestration event',
    );
  }
}

async function autoDispatchGateFollowUps(
  fastify: FastifyInstance,
  completedTask: Awaited<ReturnType<typeof getProjectTask>>,
) {
  const dependentTasks = await listDependentTasks(fastify.sqlite, completedTask.id);
  const gateCandidates = dependentTasks.filter(
    (task) =>
      task.projectId === completedTask.projectId &&
      task.sessionId === completedTask.sessionId &&
      (task.assignedRole === 'GATE' ||
        task.kind === 'review' ||
        task.kind === 'verify'),
  );
  const results: Array<{
    dispatched: boolean;
    error: string | null;
    status: string;
    taskId: string;
    title: string;
  }> = [];
  const seenTaskIds = new Set<string>();

  for (const task of gateCandidates) {
    seenTaskIds.add(task.id);
    try {
      const execution = await requireTaskWorkflowOrchestrator(fastify).executeTask(task.id, {
        callerSessionId: completedTask.sessionId ?? undefined,
        logger: fastify.log,
        source: 'mcp_report_to_parent_auto_gate_handoff',
      });
      results.push({
        dispatched: execution.dispatch.result?.dispatched ?? false,
        error: execution.dispatch.errorMessage,
        status: execution.task.status,
        taskId: task.id,
        title: task.title,
      });
    } catch (error) {
      results.push({
        dispatched: false,
        error: error instanceof Error ? error.message : 'Gate handoff failed',
        status: task.status,
        taskId: task.id,
        title: task.title,
      });
    }
  }

  if (completedTask.sourceType === 'spec_note' && completedTask.sourceEventId) {
    try {
      const gateWave =
        await requireTaskWorkflowOrchestrator(
          fastify,
        ).dispatchGateTasksForCompletedWave({
          callerSessionId: completedTask.sessionId ?? undefined,
          noteId: completedTask.sourceEventId,
          projectId: completedTask.projectId,
          sessionId: completedTask.sessionId,
          source: 'mcp_report_to_parent_auto_gate_wave',
        });

      for (const dispatch of gateWave.dispatchResults) {
        if (seenTaskIds.has(dispatch.task.id)) {
          continue;
        }

        seenTaskIds.add(dispatch.task.id);
        results.push({
          dispatched: dispatch.dispatched,
          error: dispatch.reason ?? null,
          status: dispatch.task.status,
          taskId: dispatch.task.id,
          title: dispatch.task.title,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Gate wave handoff failed';
      logDiagnostic(
        fastify.log,
        'warn',
        {
          event: taskOrchestrationEventNames.gateRequired,
          noteId: completedTask.sourceEventId,
          projectId: completedTask.projectId,
          taskId: completedTask.id,
        },
        message,
      );
    }
  }

  return results;
}

async function ensureFixFollowUpTask(
  fastify: FastifyInstance,
  failedGateTask: Awaited<ReturnType<typeof getProjectTask>>,
  summary: string,
) {
  const existingFixTaskId = (
    fastify.sqlite
      .prepare(
        `
          SELECT id
          FROM project_tasks
          WHERE project_id = @projectId
            AND parent_task_id = @parentTaskId
            AND kind = 'implement'
            AND deleted_at IS NULL
            AND status IN ('PENDING', 'READY', 'RUNNING', 'WAITING_RETRY')
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get({
        parentTaskId: failedGateTask.id,
        projectId: failedGateTask.projectId,
      }) as { id: string } | undefined
  )?.id;

  const objective =
    `Address the gate feedback for "${failedGateTask.title}". ` +
    `Latest failure summary: ${summary}`;

  const fixTask = existingFixTaskId
    ? await updateTask(fastify.sqlite, existingFixTaskId, {
        assignedRole: 'CRAFTER',
        completionSummary: null,
        objective,
        parentTaskId: failedGateTask.id,
        sessionId: failedGateTask.sessionId,
        status: 'READY',
        title: `Fix: ${failedGateTask.title}`,
        verificationCommands: failedGateTask.verificationCommands,
      })
    : await createTask(fastify.sqlite, {
        acceptanceCriteria: [
          `Resolve the gate failure for "${failedGateTask.title}"`,
          'Report the fix outcome back to the parent coordinator',
        ],
        assignedRole: 'CRAFTER',
        kind: 'implement',
        objective,
        parentTaskId: failedGateTask.id,
        projectId: failedGateTask.projectId,
        sessionId: failedGateTask.sessionId,
        sourceEventId: failedGateTask.id,
        sourceType: 'gate_fix_loop',
        status: 'READY',
        title: `Fix: ${failedGateTask.title}`,
        verificationCommands: failedGateTask.verificationCommands,
      });

  return {
    created: fixTask.id !== existingFixTaskId,
    task: await getTaskById(fastify.sqlite, fixTask.id),
  };
}

function buildWakeMessage(input: {
  childSessionId: string;
  delegationGroup: {
    groupId: string;
    status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  } | null;
  noteId: string;
  task: Awaited<ReturnType<typeof getProjectTask>>;
  tasks: Awaited<ReturnType<typeof listDelegationGroupTasks>>;
}) {
  if (
    input.delegationGroup &&
    input.delegationGroup.status === 'COMPLETED' &&
    input.tasks.length > 0
  ) {
    const summaries = input.tasks.map((task) => {
      const detail = task.completionSummary ?? task.verificationVerdict ?? task.status;
      return `- ${task.title}: ${detail}`;
    });

    return [
      '## Delegation Group Complete',
      '',
      `Group ${input.delegationGroup.groupId} has finished.`,
      '',
      ...summaries,
      '',
      `Review note: /api/notes/${input.noteId}`,
    ].join('\n');
  }

  return [
    '## Child Session Reported',
    '',
    `Task: ${input.task.title}`,
    `Status: ${input.task.status}`,
    `Session: ${input.childSessionId}`,
    input.task.completionSummary
      ? `Summary: ${input.task.completionSummary}`
      : null,
    input.task.verificationVerdict
      ? `Verification: ${input.task.verificationVerdict}`
      : null,
    `Review note: /api/notes/${input.noteId}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

async function maybeWakeParentSession(
  fastify: FastifyInstance,
  input: {
    childSessionId: string;
    delegationGroup: {
      completedCount: number;
      failureCount: number;
      groupId: string;
      parentSessionId: string | null;
      pendingCount: number;
      sessionIds: string[];
      settled: boolean;
      status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      taskIds: string[];
      totalCount: number;
    } | null;
    noteId: string;
    parentSessionId: string | null;
    projectId: string;
    task: Awaited<ReturnType<typeof getProjectTask>>;
  },
) {
  if (!input.parentSessionId) {
    return {
      delivered: false,
      mode: input.delegationGroup ? 'after_all' : 'immediate',
      reason: 'no_parent_session',
    };
  }

  if (input.delegationGroup && !input.delegationGroup.settled) {
    return {
      delivered: false,
      mode: 'after_all',
      reason: 'waiting_for_group_barrier',
    };
  }

  if (!fastify.acpRuntime.isSessionActive(input.parentSessionId)) {
    return {
      delivered: false,
      mode: input.delegationGroup ? 'after_all' : 'immediate',
      reason: 'parent_session_inactive',
    };
  }

  const tasks =
    input.delegationGroup &&
    (input.delegationGroup.status === 'COMPLETED' ||
      input.delegationGroup.status === 'FAILED')
      ? await listDelegationGroupTasks(fastify.sqlite, {
          groupId: input.delegationGroup.groupId,
          projectId: input.projectId,
        })
      : [input.task];

  const wakeEventId = input.delegationGroup?.groupId
    ? `orch_resume_group_${input.delegationGroup.groupId}`
    : `orch_resume_child_${input.childSessionId}`;
  if (hasAcpSessionEvent(fastify.sqlite, wakeEventId)) {
    return {
      delivered: false,
      mode: input.delegationGroup ? 'after_all' : 'immediate',
      reason: 'resume_already_requested',
    };
  }

  await fastify.acpRuntime.promptSession({
    localSessionId: input.parentSessionId,
    prompt: buildWakeMessage({
      childSessionId: input.childSessionId,
      delegationGroup: input.delegationGroup
        ? {
            groupId: input.delegationGroup.groupId,
            status: input.delegationGroup.status,
          }
        : null,
      noteId: input.noteId,
      task: input.task,
      tasks,
    }),
  });
  recordAcpOrchestrationEvent(fastify.sqlite, fastify.acpStreamBroker, {
    childSessionId: input.childSessionId,
    delegationGroupId: input.delegationGroup?.groupId ?? null,
    eventId: wakeEventId,
    eventName: 'parent_session_resume_requested',
    parentSessionId: input.parentSessionId,
    sessionId: input.parentSessionId,
    taskId: input.task.id,
    taskIds: tasks.map((task) => task.id),
    wakeDelivered: true,
  });

  logDiagnostic(
    fastify.log,
    'info',
    {
      childSessionId: input.childSessionId,
      event: taskOrchestrationEventNames.parentSessionResumeRequested,
      groupId: input.delegationGroup?.groupId ?? null,
      parentSessionId: input.parentSessionId,
      taskId: input.task.id,
    },
    'Prompted parent session to resume after child completion',
  );

  return {
    delivered: true,
    mode: input.delegationGroup ? 'after_all' : 'immediate',
    reason: null,
  };
}
