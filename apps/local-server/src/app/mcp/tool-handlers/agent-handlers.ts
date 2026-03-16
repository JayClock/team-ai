import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAgents } from '../../services/agent-service';
import { readAgentConversation } from '../../services/acp-conversation-service';
import {
  getOrCreateActiveDelegationGroup,
  registerDelegationGroupTask,
} from '../../services/delegation-group-service';
import { getProjectById } from '../../services/project-service';
import {
  agentsListArgsSchema,
  delegateTaskToAgentArgsSchema,
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

export function createAgentsListHandler(fastify: FastifyInstance) {
  return async (args: AgentsListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    return listAgents(fastify.sqlite, args);
  };
}

export function createDelegateTaskToAgentHandler(fastify: FastifyInstance) {
  return async (args: DelegateTaskToAgentArgs) => {
    const workflow = fastify.taskWorkflowOrchestrator;

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
    const group =
      (args.waitMode ?? 'after_all') === 'after_all'
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

    return {
      delegation: {
        additionalInstructions: args.additionalInstructions ?? null,
        delegationGroupId: registeredGroup?.id ?? null,
        requestedSpecialist: delegation.requested,
        resolvedRole: delegation.resolvedRole,
        resolvedSpecialist: {
          id: delegation.specialist.id,
          name: delegation.specialist.name,
        },
        waitMode: args.waitMode ?? 'after_all',
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
