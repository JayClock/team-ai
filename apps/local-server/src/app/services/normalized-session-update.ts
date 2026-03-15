import type {
  ContentBlock,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type {
  AcpEventTypePayload,
  AcpSessionState,
} from '../schemas/acp';

export type NormalizedSessionUpdateEventType =
  | 'tool_call'
  | 'tool_call_update'
  | 'agent_message'
  | 'agent_thought'
  | 'user_message'
  | 'plan_update'
  | 'turn_complete'
  | 'session_info_update'
  | 'current_mode_update'
  | 'config_option_update'
  | 'usage_update'
  | 'available_commands_update'
  | 'error';

export interface NormalizedToolCall {
  content: unknown[];
  input?: unknown;
  inputFinalized: boolean;
  kind?: string | null;
  locations: unknown[];
  output?: unknown;
  status: 'completed' | 'failed' | 'pending' | 'running';
  title?: string | null;
  toolCallId?: string;
}

export interface NormalizedSessionUpdate {
  eventType: NormalizedSessionUpdateEventType;
  provider: string;
  rawNotification: SessionNotification;
  sessionId: string;
  timestamp: string;
  traceId?: string;
  availableCommands?: unknown[];
  configOptions?: unknown;
  error?: {
    code: string;
    message: string;
  };
  message?: {
    content: string | null;
    contentBlock: ContentBlock;
    isChunk: boolean;
    messageId?: string | null;
    role: 'assistant' | 'thought' | 'user';
  };
  mode?: {
    currentModeId?: string;
  };
  planItems?: Array<{
    description: string;
    priority?: 'high' | 'low' | 'medium';
    status?: 'completed' | 'in_progress' | 'pending';
  }>;
  sessionInfo?: {
    title?: string | null;
    updatedAt?: string | null;
  };
  toolCall?: NormalizedToolCall;
  turnComplete?: {
    state?: Extract<AcpSessionState, 'FAILED' | 'CANCELLED'>;
    stopReason: string;
    usage: unknown;
    userMessageId: string | null;
  };
  usage?: {
    cost: unknown;
    size: number;
    used: number;
  };
}

export type PersistedAcpEvent = {
  payload: Record<string, unknown>;
  type: AcpEventTypePayload;
};

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
          content: flattenContentBlock(updateRecord.content),
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

export function toPersistedAcpEvent(
  update: NormalizedSessionUpdate,
): PersistedAcpEvent {
  switch (update.eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'user_message':
      return {
        type: 'message',
        payload: {
          source: 'acp-sdk',
          kind: update.rawNotification.update.sessionUpdate,
          role: update.message?.role ?? 'assistant',
          messageId: update.message?.messageId ?? null,
          content: update.message?.content ?? null,
          contentBlock: update.message?.contentBlock ?? null,
          provider: update.provider,
        },
      };
    case 'tool_call':
      return {
        type: 'tool_call',
        payload: {
          source: 'acp-sdk',
          toolCallId: update.toolCall?.toolCallId,
          title: update.toolCall?.title ?? null,
          status: update.toolCall?.status ?? null,
          kind: update.toolCall?.kind ?? null,
          rawInput: update.toolCall?.input ?? null,
          rawOutput: update.toolCall?.output ?? null,
          locations: update.toolCall?.locations ?? [],
          content: update.toolCall?.content ?? [],
          provider: update.provider,
        },
      };
    case 'tool_call_update':
      return {
        type: update.toolCall?.status === 'completed' ? 'tool_result' : 'tool_call',
        payload: {
          source: 'acp-sdk',
          toolCallId: update.toolCall?.toolCallId,
          title: update.toolCall?.title ?? null,
          status: update.toolCall?.status ?? null,
          kind: update.toolCall?.kind ?? null,
          rawInput: update.toolCall?.input ?? null,
          rawOutput: update.toolCall?.output ?? null,
          locations: update.toolCall?.locations ?? [],
          content: update.toolCall?.content ?? [],
          provider: update.provider,
        },
      };
    case 'plan_update':
      return {
        type: 'plan',
        payload: {
          source: 'acp-sdk',
          entries: (update.planItems ?? []).map((item) => ({
            content: item.description,
            ...(item.priority ? { priority: item.priority } : {}),
            ...(item.status ? { status: item.status } : {}),
          })),
          provider: update.provider,
        },
      };
    case 'session_info_update':
      return {
        type: 'session',
        payload: {
          source: 'acp-sdk',
          title: update.sessionInfo?.title ?? null,
          updatedAt: update.sessionInfo?.updatedAt ?? null,
          provider: update.provider,
        },
      };
    case 'current_mode_update':
      return {
        type: 'mode',
        payload: {
          source: 'acp-sdk',
          currentModeId: update.mode?.currentModeId,
          provider: update.provider,
        },
      };
    case 'config_option_update':
      return {
        type: 'config',
        payload: {
          source: 'acp-sdk',
          configOptions: update.configOptions ?? {},
          provider: update.provider,
        },
      };
    case 'usage_update':
      return {
        type: 'usage',
        payload: {
          source: 'acp-sdk',
          size: update.usage?.size ?? 0,
          used: update.usage?.used ?? 0,
          cost: update.usage?.cost ?? null,
          provider: update.provider,
        },
      };
    case 'available_commands_update':
      return {
        type: 'status',
        payload: {
          source: 'acp-sdk',
          availableCommands: update.availableCommands ?? [],
          provider: update.provider,
        },
      };
    case 'error':
      return {
        type: 'status',
        payload: {
          source: 'acp-sdk',
          error: update.error ?? null,
          provider: update.provider,
        },
      };
    case 'turn_complete':
      return {
        type: 'complete',
        payload: {
          source: 'acp-sdk',
          stopReason: update.turnComplete?.stopReason ?? 'end_turn',
          userMessageId: update.turnComplete?.userMessageId ?? null,
          usage: update.turnComplete?.usage ?? null,
          ...(update.turnComplete?.state
            ? { state: update.turnComplete.state }
            : {}),
          provider: update.provider,
        },
      };
  }

  throw new Error(`Unsupported normalized ACP event type: ${update.eventType}`);
}

export function resolveSessionStateFromNormalizedUpdate(
  update: NormalizedSessionUpdate,
  fallback: AcpSessionState,
): AcpSessionState {
  switch (update.eventType) {
    case 'agent_message':
    case 'agent_thought':
    case 'tool_call':
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

function flattenContentBlock(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const block = content as ContentBlock;

  if (block.type === 'text') {
    return block.text;
  }

  if (block.type === 'resource_link') {
    return block.uri;
  }

  if (block.type === 'resource') {
    const resource = block.resource;
    if ('text' in resource) {
      return resource.text;
    }
  }

  return null;
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

function hasStructuredValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return value !== null && value !== undefined;
}

function normalizeTurnCompleteState(
  state: string | null | undefined,
): Extract<AcpSessionState, 'FAILED' | 'CANCELLED'> | undefined {
  if (state === 'FAILED' || state === 'CANCELLED') {
    return state;
  }

  return undefined;
}
