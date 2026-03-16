import {
  agentsListArgsSchema,
  delegateTaskToAgentArgsSchema,
} from '../contracts';
import {
  createAgentsListHandler,
  createDelegateTaskToAgentHandler,
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
] as const;
