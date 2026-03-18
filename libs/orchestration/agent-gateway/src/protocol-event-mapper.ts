import type {
  GatewayEventError,
  GatewayEventType,
  GatewaySessionState,
  ProtocolName,
  SessionEventInput,
} from './session-store.js';
import type {
  NormalizedAcpUpdate,
  ProviderProtocolEvent,
} from './providers/provider-types.js';

export type ProtocolEnvelope =
  | Extract<ProviderProtocolEvent, { protocol: 'acp' }>
  | {
      protocol: Exclude<ProtocolName, 'acp'>;
      payload: unknown;
      traceId?: string;
    };

export function mapProtocolEvent(envelope: ProtocolEnvelope): SessionEventInput {
  switch (envelope.protocol) {
    case 'mcp':
      return mapMcpEvent(asRecord(envelope.payload), envelope.traceId);
    case 'acp':
      return mapAcpEvent(envelope.update, envelope.traceId);
    case 'a2a':
      return mapA2aEvent(asRecord(envelope.payload), envelope.traceId);
  }
}

function mapMcpEvent(payload: Record<string, unknown>, traceId?: string): SessionEventInput {
  const explicitState = extractState(payload);
  if (explicitState) {
    return statusEvent(payload, traceId, explicitState, 'mcp');
  }

  if (payload.error) {
    return {
      type: 'error',
      traceId,
      data: { protocol: 'mcp', payload },
      error: normalizeError(payload.error),
      nextState: 'FAILED',
    };
  }

  const method = asText(payload.method);
  if (method === 'tools/call' || payload.type === 'tool_call' || payload.type === 'tool_result') {
    return toolEvent(payload, traceId, 'mcp');
  }

  if (payload.type === 'complete') {
    return completeEvent(payload, traceId, 'mcp');
  }

  return deltaEvent(payload, traceId, 'mcp');
}

function mapAcpEvent(update: NormalizedAcpUpdate, traceId?: string): SessionEventInput {
  const effectiveTraceId = traceId ?? update.traceId;

  switch (update.eventType) {
    case 'tool_call':
    case 'tool_call_update':
      return {
        type: 'tool',
        traceId: effectiveTraceId,
        data: {
          protocol: 'acp',
          update,
        },
        nextState:
          update.eventType === 'tool_call_update' &&
          update.toolCall?.status === 'failed'
            ? 'FAILED'
            : 'RUNNING',
      };
    case 'turn_complete':
      return {
        type: 'complete',
        traceId: effectiveTraceId,
        data: {
          protocol: 'acp',
          update,
        },
        ...(update.turnComplete?.state
          ? { nextState: update.turnComplete.state }
          : {}),
      };
    case 'error':
      return {
        type: 'error',
        traceId: effectiveTraceId,
        data: { protocol: 'acp', update },
        error: normalizeError(update.error),
        nextState: 'FAILED',
      };
    default:
      return {
        type: 'delta',
        traceId: effectiveTraceId,
        data: {
          protocol: 'acp',
          text: update.message?.content ?? null,
          update,
        },
        nextState: 'RUNNING',
      };
  }
}

function mapA2aEvent(payload: Record<string, unknown>, traceId?: string): SessionEventInput {
  const explicitState = extractState(payload);
  if (explicitState) {
    return statusEvent(payload, traceId, explicitState, 'a2a');
  }

  const messageType = asText(payload.messageType ?? payload.type);
  if (messageType === 'TASK_FORWARD_ACK') {
    return statusEvent(payload, traceId, 'RUNNING', 'a2a');
  }
  if (messageType?.includes('FAILED') || payload.error) {
    return {
      type: 'error',
      traceId,
      data: { protocol: 'a2a', payload },
      error: normalizeError(payload.error ?? payload),
      nextState: 'FAILED',
    };
  }
  if (messageType?.includes('COMPLETE') || messageType === 'TASK_COMPLETED') {
    return completeEvent(payload, traceId, 'a2a');
  }

  return deltaEvent(payload, traceId, 'a2a');
}

function statusEvent(
  payload: Record<string, unknown>,
  traceId: string | undefined,
  state: GatewaySessionState,
  protocol: ProtocolName
): SessionEventInput {
  return {
    type: 'status',
    traceId,
    data: {
      protocol,
      state,
      payload,
    },
    nextState: state,
  };
}

function completeEvent(
  payload: Record<string, unknown>,
  traceId: string | undefined,
  protocol: ProtocolName
): SessionEventInput {
  return {
    type: 'complete',
    traceId,
    data: {
      protocol,
      payload,
    },
  };
}

function toolEvent(
  payload: Record<string, unknown>,
  traceId: string | undefined,
  protocol: ProtocolName
): SessionEventInput {
  return {
    type: 'tool',
    traceId,
    data: {
      protocol,
      payload,
    },
    nextState: 'RUNNING',
  };
}

function deltaEvent(
  payload: Record<string, unknown>,
  traceId: string | undefined,
  protocol: ProtocolName
): SessionEventInput {
  return {
    type: 'delta',
    traceId,
    data: {
      protocol,
      text: asText(payload.content) ?? asText(payload.text) ?? null,
      payload,
    },
    nextState: 'RUNNING',
  };
}

function extractState(payload: Record<string, unknown>): GatewaySessionState | null {
  const raw = asText(payload.state ?? payload.status);
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  if (
    normalized === 'PENDING' ||
    normalized === 'RUNNING' ||
    normalized === 'FAILED' ||
    normalized === 'CANCELLED'
  ) {
    return normalized;
  }

  return null;
}

function normalizeError(errorInput: unknown): GatewayEventError {
  const input = asRecord(errorInput);

  return {
    code: asText(input.code) ?? 'PROTOCOL_ERROR',
    message: asText(input.message) ?? 'Unknown protocol error',
    retryable: asBoolean(input.retryable) ?? false,
    retryAfterMs: asNumber(input.retryAfterMs) ?? 0,
    timeoutScope: asText(input.timeoutScope) ?? undefined,
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return { value: input };
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export function ensureEventType(type: string): GatewayEventType {
  if (type === 'status' || type === 'delta' || type === 'tool' || type === 'error' || type === 'complete') {
    return type;
  }
  throw new Error(`Unsupported event type: ${type}`);
}
