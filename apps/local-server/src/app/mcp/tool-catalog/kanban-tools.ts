import {
  blockCardArgsSchema,
  createCardArgsSchema,
  getBoardViewArgsSchema,
  moveCardArgsSchema,
  requestPreviousLaneHandoffArgsSchema,
  submitLaneHandoffArgsSchema,
  unblockCardArgsSchema,
  updateCardArgsSchema,
} from '../contracts';
import {
  createBlockCardHandler,
  createCreateCardHandler,
  createGetBoardViewHandler,
  createMoveCardHandler,
  createRequestPreviousLaneHandoffHandler,
  createSubmitLaneHandoffHandler,
  createUnblockCardHandler,
  createUpdateCardHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const kanbanToolCatalog = [
  defineToolRegistration(
    'create_card',
    createCardArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Create a Kanban card on a project board and place it into a target column.',
      title: 'Create Card',
    },
    createCreateCardHandler,
  ),
  defineToolRegistration(
    'update_card',
    updateCardArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Update safe card fields while preserving the project Kanban workflow rules.',
      title: 'Update Card',
    },
    createUpdateCardHandler,
  ),
  defineToolRegistration(
    'move_card',
    moveCardArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Move a Kanban card to another board column, optionally at a specific position.',
      title: 'Move Card',
    },
    createMoveCardHandler,
  ),
  defineToolRegistration(
    'block_card',
    blockCardArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Move a Kanban card into the blocked lane and capture the current blocker reason.',
      title: 'Block Card',
    },
    createBlockCardHandler,
  ),
  defineToolRegistration(
    'unblock_card',
    unblockCardArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description: 'Move a blocked Kanban card back to a resumable lane, using the previous lane when possible.',
      title: 'Unblock Card',
    },
    createUnblockCardHandler,
  ),
  defineToolRegistration(
    'get_board_view',
    getBoardViewArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description: 'Fetch the current Kanban board projection, including cards, automation config, and explain data.',
      title: 'Get Board View',
    },
    createGetBoardViewHandler,
  ),
  defineToolRegistration(
    'request_previous_lane_handoff',
    requestPreviousLaneHandoffArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Ask the immediately previous Kanban lane session to prepare environment state, rerun a command, or provide runtime context for the current task.',
      title: 'Request Previous Lane Handoff',
    },
    createRequestPreviousLaneHandoffHandler,
  ),
  defineToolRegistration(
    'submit_lane_handoff',
    submitLaneHandoffArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Submit the result of a lane handoff request after completing the requested runtime or environment support work.',
      title: 'Submit Lane Handoff',
    },
    createSubmitLaneHandoffHandler,
  ),
] as const;
