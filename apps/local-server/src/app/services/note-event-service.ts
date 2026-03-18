import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { ProblemError } from '@orchestration/runtime-acp';
import type {
  NoteEventEnvelopePayload,
  NoteEventListPayload,
  NoteEventType,
} from '../schemas/note-event';
import type { NotePayload } from '../schemas/note';
import { getAcpSessionById } from './acp-service';
import { getProjectById } from './project-service';

const noteEventIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface NoteEventRow {
  emitted_at: string;
  event_id: string;
  note_id: string;
  payload_json: string;
  project_id: string;
  sequence?: number;
  session_id: string | null;
  source: 'user' | 'agent' | 'system';
  type: NoteEventType;
}

interface ListNoteEventsQuery {
  noteId?: string;
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  type?: NoteEventType;
}

interface ListNoteEventsSinceQuery {
  limit?: number;
  noteId?: string;
  projectId: string;
  sessionId?: string;
  sinceEventId?: string;
  type?: NoteEventType;
}

type NoteEventListener = (event: NoteEventEnvelopePayload) => void;

type NoteEventSubscriptionFilter = {
  noteId?: string;
  projectId: string;
  sessionId?: string;
  type?: NoteEventType;
};

export class NoteEventStreamBroker {
  private readonly listeners = new Set<{
    filter: NoteEventSubscriptionFilter;
    listener: NoteEventListener;
  }>();

  publish(event: NoteEventEnvelopePayload) {
    for (const entry of this.listeners) {
      if (entry.filter.projectId !== event.projectId) {
        continue;
      }
      if (entry.filter.sessionId && entry.filter.sessionId !== event.sessionId) {
        continue;
      }
      if (entry.filter.noteId && entry.filter.noteId !== event.noteId) {
        continue;
      }
      if (entry.filter.type && entry.filter.type !== event.type) {
        continue;
      }

      entry.listener(event);
    }
  }

  subscribe(filter: NoteEventSubscriptionFilter, listener: NoteEventListener) {
    const entry = {
      filter,
      listener,
    };

    this.listeners.add(entry);

    return () => {
      this.listeners.delete(entry);
    };
  }
}

const globalNoteEventStreamBroker = new NoteEventStreamBroker();

export function getNoteEventStreamBroker() {
  return globalNoteEventStreamBroker;
}

function createNoteEventId() {
  return `noteevt_${noteEventIdGenerator()}`;
}

function throwNoteEventSessionProjectMismatch(
  projectId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/note-event-session-project-mismatch',
    title: 'Note Event Session Project Mismatch',
    status: 409,
    detail: `Note event project ${projectId} does not match session ${sessionId}`,
  });
}

function parsePayload(row: NoteEventRow) {
  const payload = JSON.parse(row.payload_json) as {
    note: NotePayload;
  };

  return {
    note: payload.note,
    source: row.source,
  };
}

function mapNoteEventRow(row: NoteEventRow): NoteEventEnvelopePayload {
  return {
    data: parsePayload(row),
    emittedAt: row.emitted_at,
    eventId: row.event_id,
    noteId: row.note_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    type: row.type,
  };
}

export async function recordNoteEvent(
  sqlite: Database,
  input: {
    note: NotePayload;
    type: NoteEventType;
  },
): Promise<NoteEventEnvelopePayload> {
  const emittedAt = new Date().toISOString();
  const event: NoteEventEnvelopePayload = {
    data: {
      note: input.note,
      source: input.note.source,
    },
    emittedAt,
    eventId: createNoteEventId(),
    noteId: input.note.id,
    projectId: input.note.projectId,
    sessionId: input.note.sessionId,
    type: input.type,
  };

  sqlite
    .prepare(
      `
        INSERT INTO project_note_events (
          event_id,
          project_id,
          note_id,
          session_id,
          type,
          source,
          payload_json,
          emitted_at,
          created_at
        )
        VALUES (
          @eventId,
          @projectId,
          @noteId,
          @sessionId,
          @type,
          @source,
          @payloadJson,
          @emittedAt,
          @createdAt
        )
      `,
    )
    .run({
      createdAt: emittedAt,
      emittedAt,
      eventId: event.eventId,
      noteId: event.noteId,
      payloadJson: JSON.stringify({
        note: event.data.note,
      }),
      projectId: event.projectId,
      sessionId: event.sessionId,
      source: event.data.source,
      type: event.type,
    });

  getNoteEventStreamBroker().publish(event);

  return event;
}

export async function listNoteEvents(
  sqlite: Database,
  query: ListNoteEventsQuery,
): Promise<NoteEventListPayload> {
  const { noteId, page, pageSize, projectId, sessionId, type } = query;
  await getProjectById(sqlite, projectId);

  if (sessionId) {
    const session = await getAcpSessionById(sqlite, sessionId);
    if (session.project.id !== projectId) {
      throwNoteEventSessionProjectMismatch(projectId, sessionId);
    }
  }

  const offset = (page - 1) * pageSize;
  const filters = ['project_id = @projectId'];
  const parameters: Record<string, unknown> = {
    limit: pageSize,
    offset,
    projectId,
  };

  if (sessionId) {
    filters.push('session_id = @sessionId');
    parameters.sessionId = sessionId;
  }

  if (noteId) {
    filters.push('note_id = @noteId');
    parameters.noteId = noteId;
  }

  if (type) {
    filters.push('type = @type');
    parameters.type = type;
  }

  const whereClause = filters.join(' AND ');
  const items = sqlite
    .prepare(
      `
        SELECT
          event_id,
          project_id,
          note_id,
          session_id,
          type,
          source,
          payload_json,
          emitted_at
        FROM project_note_events
        WHERE ${whereClause}
        ORDER BY sequence DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(parameters) as NoteEventRow[];

  const total = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM project_note_events
        WHERE ${whereClause}
      `,
    )
    .get(parameters) as { count: number };

  return {
    items: items.map(mapNoteEventRow),
    noteId,
    page,
    pageSize,
    projectId,
    sessionId,
    total: total.count,
    type,
  };
}

function resolveSinceSequence(
  sqlite: Database,
  sinceEventId: string | undefined,
) {
  if (!sinceEventId) {
    return 0;
  }

  const row = sqlite
    .prepare(
      `
        SELECT sequence
        FROM project_note_events
        WHERE event_id = ?
      `,
    )
    .get(sinceEventId) as { sequence: number } | undefined;

  return row?.sequence ?? 0;
}

export async function listNoteEventsSince(
  sqlite: Database,
  query: ListNoteEventsSinceQuery,
) {
  const {
    limit = 200,
    noteId,
    projectId,
    sessionId,
    sinceEventId,
    type,
  } = query;
  await getProjectById(sqlite, projectId);

  if (sessionId) {
    const session = await getAcpSessionById(sqlite, sessionId);
    if (session.project.id !== projectId) {
      throwNoteEventSessionProjectMismatch(projectId, sessionId);
    }
  }

  const filters = ['project_id = @projectId', 'sequence > @sinceSequence'];
  const parameters: Record<string, unknown> = {
    limit,
    projectId,
    sinceSequence: resolveSinceSequence(sqlite, sinceEventId),
  };

  if (sessionId) {
    filters.push('session_id = @sessionId');
    parameters.sessionId = sessionId;
  }

  if (noteId) {
    filters.push('note_id = @noteId');
    parameters.noteId = noteId;
  }

  if (type) {
    filters.push('type = @type');
    parameters.type = type;
  }

  const whereClause = filters.join(' AND ');
  const rows = sqlite
    .prepare(
      `
        SELECT
          sequence,
          event_id,
          project_id,
          note_id,
          session_id,
          type,
          source,
          payload_json,
          emitted_at
        FROM project_note_events
        WHERE ${whereClause}
        ORDER BY sequence ASC
        LIMIT @limit
      `,
    )
    .all(parameters) as NoteEventRow[];

  return rows.map(mapNoteEventRow);
}
