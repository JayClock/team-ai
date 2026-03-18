import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { AcpEventEnvelopePayload } from '@orchestration/runtime-acp';
import { AcpSessionEventWriteBuffer } from './acp-session-event-write-buffer';

function createTestDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE project_acp_session_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      error_json TEXT,
      emitted_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return sqlite;
}

function buildEvent(
  sessionId: string,
  eventId: string,
): AcpEventEnvelopePayload {
  const emittedAt = '2026-03-18T00:00:00.000Z';
  return {
    emittedAt,
    error: null,
    eventId,
    sessionId,
    update: {
      eventType: 'agent_message',
      message: {
        content: `message-${eventId}`,
        contentBlock: null,
        isChunk: false,
        messageId: eventId,
        role: 'assistant',
      },
      provider: 'codex',
      rawNotification: null,
      sessionId,
      timestamp: emittedAt,
    },
  };
}

function countEvents(sqlite: SqliteDatabase): number {
  return (
    sqlite
      .prepare('SELECT COUNT(*) AS count FROM project_acp_session_events')
      .get() as { count: number }
  ).count;
}

describe('AcpSessionEventWriteBuffer', () => {
  it('keeps events in memory until the session is flushed', async () => {
    const sqlite = createTestDatabase();
    const buffer = new AcpSessionEventWriteBuffer(sqlite, {
      debounceMs: 60_000,
      maxBufferSize: 10,
    });

    buffer.add(buildEvent('session-1', 'evt-1'));

    expect(buffer.bufferSize('session-1')).toBe(1);
    expect(buffer.hasEvent('evt-1')).toBe(true);
    expect(countEvents(sqlite)).toBe(0);

    await buffer.flushSession('session-1');

    expect(buffer.bufferSize('session-1')).toBe(0);
    expect(buffer.hasEvent('evt-1')).toBe(false);
    expect(countEvents(sqlite)).toBe(1);

    sqlite.close();
  });

  it('auto-flushes when the per-session buffer reaches the configured limit', async () => {
    const sqlite = createTestDatabase();
    const buffer = new AcpSessionEventWriteBuffer(sqlite, {
      debounceMs: 60_000,
      maxBufferSize: 2,
    });

    buffer.add(buildEvent('session-1', 'evt-1'));
    buffer.add(buildEvent('session-1', 'evt-2'));

    await vi.waitFor(() => {
      expect(countEvents(sqlite)).toBe(2);
    });

    expect(buffer.bufferSize('session-1')).toBe(0);
    sqlite.close();
  });

  it('flushes pending events on close', async () => {
    const sqlite = createTestDatabase();
    const buffer = new AcpSessionEventWriteBuffer(sqlite, {
      debounceMs: 60_000,
      maxBufferSize: 10,
    });

    buffer.add(buildEvent('session-1', 'evt-1'));
    buffer.add(buildEvent('session-1', 'evt-2'));

    await buffer.close();

    expect(countEvents(sqlite)).toBe(2);
    sqlite.close();
  });
});
