import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTaskWorkflowRuntime } from '../task-workflow-runtime';
import { listAgents } from '../../services/agent-service';
import { readAgentConversation } from '../../services/acp-conversation-service';
import {
  getDelegationGroupProgress,
  getOrCreateActiveDelegationGroup,
  registerDelegationGroupTask,
} from '../../services/delegation-group-service';
import { getProjectById } from '../../services/project-service';
import {
  agentsListArgsSchema,
  delegateTaskToAgentParentResumeSchema,
  delegateTaskToAgentArgsSchema,
  delegateTaskToAgentWaveStateSchema,
  readAgentConversationArgsSchema,
} from '../contracts';
import {
  getProjectSession,
  getProjectTask,
  resolveDelegationSpecialist,
} from '../utils';

type AgentsListArgs = z.infer<typeof agentsListArgsSchema>;
type DelegateTaskToAgentArgs = z.infer<typeof delegateTaskToAgentArgsSchema>;
type ReadAgentConversationArgs = z.infer<typeof readAgentConversationArgsSchema>;

function resolveWaveKind(task: {
  kind: string | null;
}): z.infer<typeof delegateTaskToAgentWaveStateSchema>['waveKind'] {
  if (task.kind === 'review' || task.kind === 'verify') {
    return 'gate';
  }

  if (task.kind === 'implement' || task.kind === 'plan') {
    return 'implement';
  }

  return null;
}

function buildWaveState(input: {
  groupId: string | null;
  progress: Awaited<ReturnType<typeof getDelegationGroupProgress>> | null;
  task: {
    id: string;
    kind: string | null;
  };
}) {
  const waveKind = resolveWaveKind(input.task);
  const taskIds =
    input.progress?.taskIds.length
      ? input.progress.taskIds
      : [input.task.id];

  return delegateTaskToAgentWaveStateSchema.parse({
    completedCount: input.progress?.completedCount ?? 0,
    failureCount: input.progress?.failureCount ?? 0,
    groupId: input.groupId,
    pendingCount:
      input.progress?.pendingCount ?? 1,
    settled: input.progress?.settled ?? false,
    status: input.progress?.status ?? null,
    taskIds,
    totalCount: input.progress?.totalCount ?? taskIds.length,
    waveId:
      input.groupId && waveKind
        ? `${input.groupId}:${waveKind}`
        : null,
    waveKind,
  });
}

function buildParentResumeWhen(input: {
  groupId: string | null;
  progress: Awaited<ReturnType<typeof getDelegationGroupProgress>> | null;
  taskId: string;
  waitMode: 'after_all' | 'immediate';
}) {
  return delegateTaskToAgentParentResumeSchema.parse({
    condition:
      input.waitMode === 'after_all'
        ? 'after_delegation_group_settled'
        : 'after_child_session_report',
    groupId: input.groupId,
    pendingTaskCount: input.progress?.pendingCount ?? 1,
    taskIds: input.progress?.taskIds.length
      ? input.progress.taskIds
      : [input.taskId],
    waitMode: input.waitMode,
  });
}

export function createAgentsListHandler(fastify: FastifyInstance) {
  return async (args: AgentsListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    return listAgents(fastify.sqlite, args);
  };
}

export function createDelegateTaskToAgentHandler(fastify: FastifyInstance) {
  return async (args: DelegateTaskToAgentArgs) => {
    const workflow = getTaskWorkflowRuntime(fastify);

    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectSession(
      fastify.sqlite,
      args.projectId,
      args.callerSessionId,
    );
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);

    const delegation = await resolveDelegationSpecialist(
      fastify.sqlite,
      args.projectId,
      args.specialist,
    );
    const waitMode = args.waitMode ?? 'after_all';
    const group =
      waitMode === 'after_all'
        ? await getOrCreateActiveDelegationGroup(fastify.sqlite, {
            callerSessionId: args.callerSessionId,
            parentSessionId: args.callerSessionId,
            projectId: args.projectId,
          })
        : null;
    const task = await workflow.patchTaskFromMcpAndMaybeExecute(
      args.taskId,
      {
        assignedProvider: args.provider,
        parallelGroup: group?.id ?? null,
        assignedRole: delegation.resolvedRole,
        assignedSpecialistId: delegation.specialist.id,
        status: 'READY',
      },
      {
        callerSessionId: args.callerSessionId,
        logger: fastify.log,
        source: 'mcp_delegate_task_to_agent',
      },
    );
    const registeredGroup =
      group === null
        ? null
        : await registerDelegationGroupTask(fastify.sqlite, {
            groupId: group.id,
            taskId: task.id,
          });
    const groupProgress =
      registeredGroup === null
        ? null
        : await getDelegationGroupProgress(fastify.sqlite, {
            groupId: registeredGroup.id,
            projectId: args.projectId,
          });
    const groupId = registeredGroup?.id ?? null;
    const waveState = buildWaveState({
      groupId,
      progress: groupProgress,
      task,
    });
    const parentWillResumeWhen = buildParentResumeWhen({
      groupId,
      progress: groupProgress,
      taskId: task.id,
      waitMode,
    });

    return {
      delegation: {
        additionalInstructions: args.additionalInstructions ?? null,
        delegationGroupId: registeredGroup?.id ?? null,
        groupId,
        parentWillResumeWhen,
        requestedSpecialist: delegation.requested,
        resolvedRole: delegation.resolvedRole,
        resolvedSpecialist: {
          id: delegation.specialist.id,
          name: delegation.specialist.name,
        },
        waitMode,
        waveState,
      },
      task,
    };
  };
}

export function createReadAgentConversationHandler(fastify: FastifyInstance) {
  return async (args: ReadAgentConversationArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);

    return await readAgentConversation(fastify.sqlite, args);
  };
}
