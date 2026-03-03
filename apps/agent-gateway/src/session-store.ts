import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export type GatewaySessionState =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type GatewayEventType = 'status' | 'delta' | 'tool' | 'error' | 'complete';

export type ProtocolName = 'mcp' | 'acp' | 'a2a';

export type GatewayEventError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
};

export type GatewayEventEnvelope = {
  eventId: string;
  cursor: string;
  sessionId: string;
  traceId: string;
  type: GatewayEventType;
  emittedAt: string;
  data: Record<string, unknown>;
  error?: GatewayEventError;
};

export type SessionEventInput = {
  type: GatewayEventType;
  traceId?: string;
  data?: Record<string, unknown>;
  error?: GatewayEventError;
  nextState?: GatewaySessionState;
};

export type GatewaySession = {
  sessionId: string;
  state: GatewaySessionState;
  createdAt: string;
  updatedAt: string;
  lastCursor: string | null;
};

type SessionRecord = GatewaySession & {
  counter: number;
  events: GatewayEventEnvelope[];
};

const TERMINAL_STATES = new Set<GatewaySessionState>(['COMPLETED', 'FAILED', 'CANCELLED']);

const TRANSITIONS: Record<GatewaySessionState, GatewaySessionState[]> = {
  PENDING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class SessionStateTransitionError extends Error {
  readonly code = 'SESSION_STATE_TRANSITION_INVALID';

  constructor(
    readonly sessionId: string,
    readonly fromState: GatewaySessionState,
    readonly toState: GatewaySessionState
  ) {
    super(`Invalid session state transition: ${fromState} -> ${toState}`);
  }
}

export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND';

  constructor(readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
  }
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly emitter = new EventEmitter();

  createSession(traceId?: string): GatewaySession {
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const record: SessionRecord = {
      sessionId,
      state: 'PENDING',
      createdAt: now,
      updatedAt: now,
      lastCursor: null,
      counter: 0,
      events: [],
    };

    this.sessions.set(sessionId, record);

    this.appendEvent(sessionId, {
      type: 'status',
      traceId,
      data: {
        state: 'PENDING',
        reason: 'session-created',
      },
      nextState: 'PENDING',
    });

    return this.snapshot(record);
  }

  getSession(sessionId: string): GatewaySession {
    const record = this.requireSession(sessionId);
    return this.snapshot(record);
  }

  appendEvent(sessionId: string, input: SessionEventInput): GatewayEventEnvelope {
    const record = this.requireSession(sessionId);
    const nextState = input.nextState;

    if (nextState) {
      this.transitionState(record, nextState);
    }

    record.counter += 1;
    const eventId = `${sessionId}:${record.counter}`;
    const emittedAt = new Date().toISOString();
    const traceId = normalizeTraceId(input.traceId);

    const event: GatewayEventEnvelope = {
      eventId,
      cursor: eventId,
      sessionId,
      traceId,
      type: input.type,
      emittedAt,
      data: input.data ?? {},
      ...(input.error ? { error: input.error } : {}),
    };

    record.events.push(event);
    record.updatedAt = emittedAt;
    record.lastCursor = event.cursor;

    this.emitter.emit(this.channel(sessionId), event);

    return event;
  }

  listEventsSince(sessionId: string, cursor?: string | null): GatewayEventEnvelope[] {
    const record = this.requireSession(sessionId);

    if (!cursor) {
      return [...record.events];
    }

    const index = record.events.findIndex((event) => event.cursor === cursor);
    if (index < 0) {
      return [...record.events];
    }
    return record.events.slice(index + 1);
  }

  subscribe(
    sessionId: string,
    callback: (event: GatewayEventEnvelope) => void
  ): () => void {
    const channel = this.channel(sessionId);
    this.emitter.on(channel, callback);
    return () => this.emitter.off(channel, callback);
  }

  private transitionState(record: SessionRecord, nextState: GatewaySessionState): void {
    if (record.state === nextState) {
      return;
    }

    if (TERMINAL_STATES.has(record.state)) {
      throw new SessionStateTransitionError(record.sessionId, record.state, nextState);
    }

    const allowed = TRANSITIONS[record.state];
    if (!allowed.includes(nextState)) {
      throw new SessionStateTransitionError(record.sessionId, record.state, nextState);
    }

    record.state = nextState;
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new SessionNotFoundError(sessionId);
    }
    return record;
  }

  private snapshot(record: SessionRecord): GatewaySession {
    return {
      sessionId: record.sessionId,
      state: record.state,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastCursor: record.lastCursor,
    };
  }

  private channel(sessionId: string): string {
    return `session:${sessionId}`;
  }
}

function normalizeTraceId(traceId: string | undefined): string {
  if (!traceId || traceId.trim().length === 0) {
    return 'unknown';
  }
  return traceId;
}
