import type { AcpSessionState } from '../schemas/acp.js';
import type { NormalizedSessionUpdate } from './normalized-session-update.js';

export function resolveSessionStateFromNormalizedUpdate(
  update: NormalizedSessionUpdate,
  fallback: AcpSessionState,
): AcpSessionState {
  switch (update.eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'tool_call':
    case 'terminal_created':
    case 'terminal_output':
    case 'terminal_exited':
      return 'RUNNING';
    case 'tool_call_update':
      return update.toolCall?.status === 'failed' ? 'FAILED' : 'RUNNING';
    case 'turn_complete':
      return update.turnComplete?.state ?? fallback;
    default:
      return fallback;
  }
}

export function extractSessionMetadataFromNormalizedUpdate(
  update: NormalizedSessionUpdate,
): {
  title: string | null;
  updatedAt: string | null;
} {
  if (update.eventType !== 'session_info_update') {
    return {
      title: null,
      updatedAt: null,
    };
  }

  return {
    title: update.sessionInfo?.title ?? null,
    updatedAt: update.sessionInfo?.updatedAt ?? null,
  };
}
