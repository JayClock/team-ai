import {
  requestPreviousLaneHandoffArgsSchema,
  submitLaneHandoffArgsSchema,
} from '../contracts';
import {
  createRequestPreviousLaneHandoffHandler,
  createSubmitLaneHandoffHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const kanbanToolCatalog = [
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
