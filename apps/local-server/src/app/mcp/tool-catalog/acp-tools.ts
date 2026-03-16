import {
  cancelAcpSessionArgsSchema,
  createAcpSessionArgsSchema,
  promptAcpSessionArgsSchema,
} from '../contracts';
import {
  createAcpSessionCancelHandler,
  createAcpSessionCreateHandler,
  createAcpSessionPromptHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const acpToolCatalog = [
  defineToolRegistration(
    'acp_session_create',
    createAcpSessionArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Create a new local ACP session for a project.',
      title: 'Create ACP Session',
    },
    createAcpSessionCreateHandler,
  ),
  defineToolRegistration(
    'acp_session_prompt',
    promptAcpSessionArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Send a prompt to an existing local ACP session.',
      title: 'Prompt ACP Session',
    },
    createAcpSessionPromptHandler,
  ),
  defineToolRegistration(
    'acp_session_cancel',
    cancelAcpSessionArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Cancel an active local ACP session.',
      title: 'Cancel ACP Session',
    },
    createAcpSessionCancelHandler,
  ),
] as const;
