import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listDelegationGroupTasks } from '../../services/delegation-group-service';
import { getProjectById } from '../../services/project-service';
import { reportToParent } from '../../services/task-report-service';
import { listTaskRuns } from '../../services/task-run-service';
import { listDependentTasks, listTasks } from '../../services/task-service';
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
    const workflow = fastify.taskWorkflowOrchestrator;

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
    const workflow = fastify.taskWorkflowOrchestrator;

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
      wake,
    };
  };
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

  for (const task of gateCandidates) {
    try {
      const execution = await fastify.taskWorkflowOrchestrator.executeTask(task.id, {
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

  return results;
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
    input.delegationGroup?.status === 'COMPLETED'
      ? await listDelegationGroupTasks(fastify.sqlite, {
          groupId: input.delegationGroup.groupId,
          projectId: input.projectId,
        })
      : [input.task];

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

  return {
    delivered: true,
    mode: input.delegationGroup ? 'after_all' : 'immediate',
    reason: null,
  };
}
