import type {
  ContentBlock,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import {
  type CanonicalAcpEventType,
  type CanonicalAcpToolCall,
  type CanonicalAcpUpdate,
  flattenAcpContentText,
  hasStructuredValue,
} from './canonical-acp-update';
import type {
  AcpSessionState,
} from '../schemas/acp';

export type NormalizedSessionUpdateEventType = CanonicalAcpEventType;

export type NormalizedToolCall = CanonicalAcpToolCall;

export type NormalizedSessionUpdate = Omit<
  CanonicalAcpUpdate,
  'message' | 'rawNotification' | 'turnComplete'
> & {
  message?: Omit<
    NonNullable<CanonicalAcpUpdate['message']>,
    'contentBlock'
  > & {
    contentBlock: ContentBlock;
  };
  rawNotification: SessionNotification;
  turnComplete?: Omit<
    NonNullable<CanonicalAcpUpdate['turnComplete']>,
    'state'
  > & {
    state?: Extract<AcpSessionState, 'FAILED' | 'CANCELLED'>;
  };
};

export function coerceNormalizedSessionUpdate(
  sessionId: string,
  provider: string,
  update: NormalizedSessionUpdate | SessionNotification,
  emittedAt = new Date().toISOString(),
  traceId?: string,
): NormalizedSessionUpdate | null {
  if (isNormalizedSessionUpdate(update)) {
    return {
      ...update,
      sessionId: update.sessionId || sessionId,
      provider: update.provider || provider,
      timestamp: update.timestamp || emittedAt,
      traceId: update.traceId ?? traceId,
    };
  }

  return normalizeSessionNotification(
    sessionId,
    provider,
    update,
    emittedAt,
    traceId,
  );
}

export function normalizeSessionNotification(
  sessionId: string,
  provider: string,
  notification: SessionNotification,
  emittedAt = new Date().toISOString(),
  traceId?: string,
): NormalizedSessionUpdate | null {
  const update = notification.update;
  const updateRecord = update as Record<string, unknown>;
  const rawSessionUpdate =
    typeof updateRecord.sessionUpdate === 'string'
      ? updateRecord.sessionUpdate
      : undefined;

  if (rawSessionUpdate === 'turn_complete') {
    const turnCompleteUpdate = updateRecord as {
      sessionUpdate?: string;
      state?: string | null;
      stopReason?: string | null;
      usage?: unknown;
      userMessageId?: string | null;
    };

    return {
      sessionId,
      provider,
      timestamp: emittedAt,
      traceId,
      rawNotification: notification,
      eventType: 'turn_complete',
      turnComplete: {
        state: normalizeTurnCompleteState(turnCompleteUpdate.state),
        stopReason: turnCompleteUpdate.stopReason ?? 'end_turn',
        usage: turnCompleteUpdate.usage ?? null,
        userMessageId: turnCompleteUpdate.userMessageId ?? null,
      },
    };
  }

  switch (rawSessionUpdate) {
    case 'user_message':
    case 'user_message_chunk':
    case 'agent_message':
    case 'agent_message_chunk':
    case 'agent_thought':
    case 'agent_thought_chunk':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: resolveMessageEventType(rawSessionUpdate),
        message: {
          role: resolveMessageRole(rawSessionUpdate),
          messageId:
            typeof updateRecord.messageId === 'string'
              ? updateRecord.messageId
              : null,
          content: flattenAcpContentText(updateRecord.content),
          contentBlock: updateRecord.content as ContentBlock,
          isChunk: rawSessionUpdate.endsWith('_chunk'),
        },
      };
    case 'tool_call':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'tool_call',
        toolCall: {
          toolCallId:
            typeof updateRecord.toolCallId === 'string'
              ? updateRecord.toolCallId
              : undefined,
          title:
            typeof updateRecord.title === 'string'
              ? updateRecord.title
              : undefined,
          status: normalizeToolCallStatus(
            typeof updateRecord.status === 'string'
              ? updateRecord.status
              : undefined,
          ),
          kind:
            typeof updateRecord.kind === 'string' ? updateRecord.kind : null,
          input: updateRecord.rawInput ?? null,
          inputFinalized: hasStructuredValue(updateRecord.rawInput),
          output: updateRecord.rawOutput ?? null,
          locations: Array.isArray(updateRecord.locations)
            ? updateRecord.locations
            : [],
          content: Array.isArray(updateRecord.content)
            ? updateRecord.content
            : [],
        },
      };
    case 'tool_call_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'tool_call_update',
        toolCall: {
          toolCallId:
            typeof updateRecord.toolCallId === 'string'
              ? updateRecord.toolCallId
              : undefined,
          title:
            typeof updateRecord.title === 'string'
              ? updateRecord.title
              : null,
          status: normalizeToolCallStatus(
            typeof updateRecord.status === 'string'
              ? updateRecord.status
              : undefined,
          ),
          kind:
            typeof updateRecord.kind === 'string' ? updateRecord.kind : null,
          input: updateRecord.rawInput ?? null,
          inputFinalized:
            hasStructuredValue(updateRecord.rawInput) ||
            updateRecord.status === 'completed' ||
            updateRecord.status === 'failed',
          output: updateRecord.rawOutput ?? null,
          locations: Array.isArray(updateRecord.locations)
            ? updateRecord.locations
            : [],
          content: Array.isArray(updateRecord.content)
            ? updateRecord.content
            : [],
        },
      };
    case 'terminal_created':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'terminal_created',
        terminal: {
          terminalId:
            typeof updateRecord.terminalId === 'string'
              ? updateRecord.terminalId
              : 'unknown-terminal',
          command:
            typeof updateRecord.command === 'string'
              ? updateRecord.command
              : null,
          args: Array.isArray(updateRecord.args)
            ? updateRecord.args.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          interactive:
            typeof updateRecord.interactive === 'boolean'
              ? updateRecord.interactive
              : undefined,
        },
      };
    case 'terminal_output':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'terminal_output',
        terminal: {
          terminalId:
            typeof updateRecord.terminalId === 'string'
              ? updateRecord.terminalId
              : 'unknown-terminal',
          data:
            typeof updateRecord.data === 'string' ? updateRecord.data : null,
        },
      };
    case 'terminal_exited':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'terminal_exited',
        terminal: {
          terminalId:
            typeof updateRecord.terminalId === 'string'
              ? updateRecord.terminalId
              : 'unknown-terminal',
          exitCode:
            typeof updateRecord.exitCode === 'number'
              ? updateRecord.exitCode
              : null,
        },
      };
    case 'plan': {
      const entries = Array.isArray(updateRecord.entries)
        ? updateRecord.entries
        : [];

      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'plan_update',
        planItems: entries.map((entry) => {
          const record = entry as Record<string, unknown>;

          return {
            description:
              typeof record.content === 'string' ? record.content : '',
            priority:
              record.priority === 'high' ||
              record.priority === 'medium' ||
              record.priority === 'low'
                ? record.priority
                : undefined,
            status:
              record.status === 'completed' ||
              record.status === 'in_progress' ||
              record.status === 'pending'
                ? record.status
                : undefined,
          };
        }),
      };
    }
    case 'session_info_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'session_info_update',
        sessionInfo: {
          title:
            typeof updateRecord.title === 'string' ? updateRecord.title : null,
          updatedAt:
            typeof updateRecord.updatedAt === 'string'
              ? updateRecord.updatedAt
              : null,
        },
      };
    case 'current_mode_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'current_mode_update',
        mode: {
          currentModeId:
            typeof updateRecord.currentModeId === 'string'
              ? updateRecord.currentModeId
              : undefined,
        },
      };
    case 'config_option_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'config_option_update',
        configOptions: updateRecord.configOptions,
      };
    case 'usage_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'usage_update',
        usage: {
          size:
            typeof updateRecord.size === 'number' ? updateRecord.size : 0,
          used:
            typeof updateRecord.used === 'number' ? updateRecord.used : 0,
          cost: updateRecord.cost ?? null,
        },
      };
    case 'available_commands_update':
      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'available_commands_update',
        availableCommands: Array.isArray(updateRecord.availableCommands)
          ? updateRecord.availableCommands
          : [],
      };
    case 'error': {
      const errorUpdate = updateRecord as {
        code?: string;
        message?: string;
      };

      return {
        sessionId,
        provider,
        timestamp: emittedAt,
        traceId,
        rawNotification: notification,
        eventType: 'error',
        error: {
          code:
            typeof errorUpdate.code === 'string'
              ? errorUpdate.code
              : 'PROTOCOL_ERROR',
          message:
            typeof errorUpdate.message === 'string'
              ? errorUpdate.message
              : 'Unknown protocol error',
        },
      };
    }
  }

  return null;
}

function isNormalizedSessionUpdate(
  value: NormalizedSessionUpdate | SessionNotification,
): value is NormalizedSessionUpdate {
  return 'eventType' in value && 'provider' in value && 'timestamp' in value;
}

function resolveMessageEventType(
  updateType:
    | 'user_message'
    | 'user_message_chunk'
    | 'agent_message'
    | 'agent_message_chunk'
    | 'agent_thought'
    | 'agent_thought_chunk',
): 'agent_message' | 'agent_thought' | 'user_message' {
  if (updateType === 'user_message' || updateType === 'user_message_chunk') {
    return 'user_message';
  }

  if (
    updateType === 'agent_thought' ||
    updateType === 'agent_thought_chunk'
  ) {
    return 'agent_thought';
  }

  return 'agent_message';
}

function resolveMessageRole(
  updateType:
    | 'user_message'
    | 'user_message_chunk'
    | 'agent_message'
    | 'agent_message_chunk'
    | 'agent_thought'
    | 'agent_thought_chunk',
): 'assistant' | 'thought' | 'user' {
  if (updateType === 'user_message' || updateType === 'user_message_chunk') {
    return 'user';
  }

  if (
    updateType === 'agent_thought' ||
    updateType === 'agent_thought_chunk'
  ) {
    return 'thought';
  }

  return 'assistant';
}

function normalizeToolCallStatus(
  status: string | null | undefined,
): 'completed' | 'failed' | 'pending' | 'running' {
  if (status === 'completed' || status === 'failed') {
    return status;
  }

  if (status === 'in_progress') {
    return 'running';
  }

  return 'pending';
}

function normalizeTurnCompleteState(
  state: string | null | undefined,
): Extract<AcpSessionState, 'FAILED' | 'CANCELLED'> | undefined {
  if (state === 'FAILED' || state === 'CANCELLED') {
    return state;
  }

  return undefined;
}
