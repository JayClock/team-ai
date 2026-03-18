import type { Database } from 'better-sqlite3';
import type { AcpEventEnvelopePayload } from '@orchestration/runtime-acp';

interface BufferedAcpSessionEventRow {
  createdAt: string;
  emittedAt: string;
  errorJson: string | null;
  eventId: string;
  payloadJson: string;
  sessionId: string;
  type: string;
}

interface AcpSessionEventWriteBufferOptions {
  debounceMs?: number;
  maxBufferSize?: number;
}

const DEFAULT_DEBOUNCE_MS = 5_000;
const DEFAULT_MAX_BUFFER_SIZE = 50;

export class AcpSessionEventWriteBuffer {
  private readonly buffers = new Map<string, BufferedAcpSessionEventRow[]>();
  private readonly debounceMs: number;
  private readonly flushPromises = new Map<string, Promise<void>>();
  private readonly maxBufferSize: number;
  private readonly pendingEventIds = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly sqlite: Database,
    options: AcpSessionEventWriteBufferOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  add(event: AcpEventEnvelopePayload): void {
    const row = toBufferedRow(event);
    const buffer = this.buffers.get(event.sessionId) ?? [];
    buffer.push(row);
    this.buffers.set(event.sessionId, buffer);
    this.pendingEventIds.add(event.eventId);

    if (buffer.length >= this.maxBufferSize) {
      void this.flushSession(event.sessionId).catch(() => undefined);
      return;
    }

    this.resetTimer(event.sessionId);
  }

  bufferSize(sessionId: string): number {
    return this.buffers.get(sessionId)?.length ?? 0;
  }

  async close(): Promise<void> {
    this.dispose();
    await this.flushAll();
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async flushAll(): Promise<void> {
    const sessionIds = [...this.buffers.keys()];
    await Promise.all(sessionIds.map((sessionId) => this.flushSession(sessionId)));
  }

  async flushSession(sessionId: string): Promise<void> {
    this.clearTimer(sessionId);

    const previous = this.flushPromises.get(sessionId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const buffer = this.buffers.get(sessionId);
      if (!buffer || buffer.length === 0) {
        return;
      }

      this.buffers.delete(sessionId);
      for (const row of buffer) {
        this.pendingEventIds.delete(row.eventId);
      }

      try {
        persistBufferedRows(this.sqlite, buffer);
      } catch (error) {
        const pending = this.buffers.get(sessionId) ?? [];
        this.buffers.set(sessionId, [...buffer, ...pending]);
        for (const row of buffer) {
          this.pendingEventIds.add(row.eventId);
        }
        this.resetTimer(sessionId);
        throw error;
      }
    });

    const tracked = next.finally(() => {
      if (this.flushPromises.get(sessionId) === tracked) {
        this.flushPromises.delete(sessionId);
      }
    });
    this.flushPromises.set(sessionId, tracked);
    await tracked;
  }

  hasEvent(eventId: string): boolean {
    return this.pendingEventIds.has(eventId);
  }

  private clearTimer(sessionId: string) {
    const timer = this.timers.get(sessionId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  private resetTimer(sessionId: string) {
    this.clearTimer(sessionId);
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.flushSession(sessionId).catch(() => undefined);
    }, this.debounceMs);
    this.timers.set(sessionId, timer);
  }
}

const writeBuffers = new WeakMap<Database, AcpSessionEventWriteBuffer>();

export function getAcpSessionEventWriteBuffer(
  sqlite: Database,
): AcpSessionEventWriteBuffer {
  const existing = writeBuffers.get(sqlite);
  if (existing) {
    return existing;
  }

  const created = new AcpSessionEventWriteBuffer(sqlite);
  writeBuffers.set(sqlite, created);
  return created;
}

export async function flushAcpSessionEventWriteBuffer(
  sqlite: Database,
  sessionId: string,
): Promise<void> {
  await getAcpSessionEventWriteBuffer(sqlite).flushSession(sessionId);
}

export async function closeAcpSessionEventWriteBuffer(
  sqlite: Database,
): Promise<void> {
  const buffer = writeBuffers.get(sqlite);
  if (!buffer) {
    return;
  }

  writeBuffers.delete(sqlite);
  await buffer.close();
}

function persistBufferedRows(
  sqlite: Database,
  rows: BufferedAcpSessionEventRow[],
): void {
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO project_acp_session_events (
      event_id,
      session_id,
      type,
      payload_json,
      error_json,
      emitted_at,
      created_at
    )
    VALUES (
      @eventId,
      @sessionId,
      @type,
      @payloadJson,
      @errorJson,
      @emittedAt,
      @createdAt
    )
  `);

  const transaction = sqlite.transaction((batch: BufferedAcpSessionEventRow[]) => {
    for (const row of batch) {
      insert.run(row);
    }
  });

  transaction(rows);
}

function toBufferedRow(
  event: AcpEventEnvelopePayload,
): BufferedAcpSessionEventRow {
  return {
    createdAt: event.emittedAt,
    emittedAt: event.emittedAt,
    errorJson: event.error ? JSON.stringify(event.error) : null,
    eventId: event.eventId,
    payloadJson: JSON.stringify(event.update),
    sessionId: event.sessionId,
    type: event.update.eventType,
  };
}
