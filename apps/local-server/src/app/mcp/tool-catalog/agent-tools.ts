import {
  agentsListArgsSchema,
  delegateTaskToAgentArgsSchema,
  readAgentConversationArgsSchema,
} from '../contracts';
import {
  createAgentsListHandler,
  createDelegateTaskToAgentHandler,
  createReadAgentConversationHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const agentToolCatalog = [
  defineToolRegistration(
    'agents_list',
    agentsListArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description:
        'List local agent profiles available for a project in the desktop runtime.',
      title: 'List Agents',
    },
    createAgentsListHandler,
  ),
  defineToolRegistration(
    'delegate_task_to_agent',
    delegateTaskToAgentArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Assign a task to a downstream specialist and trigger a child execution session in the local desktop runtime.',
      title: 'Delegate Task To Agent',
    },
    createDelegateTaskToAgentHandler,
  ),
  defineToolRegistration(
    'read_agent_conversation',
    readAgentConversationArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description:
        'Read a child ACP session conversation with messages, tool activity, terminal commands, and plan projections.',
      title: 'Read Agent Conversation',
    },
    createReadAgentConversationHandler,
  ),
] as const;
