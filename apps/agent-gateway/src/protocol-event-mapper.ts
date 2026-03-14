import type {
  GatewayEventError,
  GatewayEventType,
  GatewaySessionState,
  ProtocolName,
  SessionEventInput,
} from './session-store.js';

export type ProtocolEnvelope = {
  protocol: ProtocolName;
  payload: unknown;
  traceId?: string;
};

export function mapProtocolEvent(envelope: ProtocolEnvelope): SessionEventInput {
  const payload = asRecord(envelope.payload);

  switch (envelope.protocol) {
    case 'mcp':
      return mapMcpEvent(payload, envelope.traceId);
    case 'acp':
      return mapAcpEvent(payload, envelope.traceId);
    case 'a2a':
      return mapA2aEvent(payload, envelope.traceId);
    default:
      return {
        type: 'delta',
        traceId: envelope.traceId,
        data: {
          protocol: envelope.protocol,
          payload,
        },
      };
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

function mapAcpEvent(payload: Record<string, unknown>, traceId?: string): SessionEventInput {
  const explicitState = extractState(payload);
  if (explicitState) {
    return statusEvent(payload, traceId, explicitState, 'acp');
  }

  const sessionUpdate = asText(payload.sessionUpdate);
  if (sessionUpdate === 'terminal_exited') {
    return completeEvent(payload, traceId, 'acp');
  }
  if (sessionUpdate === 'terminal_created') {
    return statusEvent(payload, traceId, 'RUNNING', 'acp');
  }
  if (sessionUpdate === 'terminal_output') {
    return deltaEvent(payload, traceId, 'acp');
  }

  const eventType = asText(payload.type);
  if (eventType === 'agent_message_chunk') {
    return deltaEvent(payload, traceId, 'acp');
  }
  if (eventType === 'tool_call' || eventType === 'tool_result') {
    return toolEvent(payload, traceId, 'acp');
  }
  if (eventType === 'complete') {
    return completeEvent(payload, traceId, 'acp');
  }
  if (payload.error) {
    return {
      type: 'error',
      traceId,
      data: { protocol: 'acp', payload },
      error: normalizeError(payload.error),
      nextState: 'FAILED',
    };
  }

  return deltaEvent(payload, traceId, 'acp');
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
