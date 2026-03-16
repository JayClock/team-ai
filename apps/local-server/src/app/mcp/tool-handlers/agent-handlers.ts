import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAgents } from '../../services/agent-service';
import { getProjectById } from '../../services/project-service';
import {
  agentsListArgsSchema,
  delegateTaskToAgentArgsSchema,
} from '../contracts';
import {
  getProjectSession,
  getProjectTask,
  resolveDelegationSpecialist,
} from '../utils';

type AgentsListArgs = z.infer<typeof agentsListArgsSchema>;
type DelegateTaskToAgentArgs = z.infer<typeof delegateTaskToAgentArgsSchema>;

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
    const task = await workflow.patchTaskFromMcpAndMaybeExecute(
      args.taskId,
      {
        assignedProvider: args.provider,
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

    return {
      delegation: {
        additionalInstructions: args.additionalInstructions ?? null,
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
