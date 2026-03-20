import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { ProblemError } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import { projectNoteEventsTable } from '../db/schema';
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

function combineFilters(filters: SQL<unknown>[]) {
  if (filters.length === 0) {
    return undefined;
  }

  return filters.length === 1 ? filters[0] : and(...filters);
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

  getDrizzleDb(sqlite)
    .insert(projectNoteEventsTable)
    .values({
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
    })
    .run();

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
  const filters: SQL<unknown>[] = [eq(projectNoteEventsTable.projectId, projectId)];

  if (sessionId) {
    filters.push(eq(projectNoteEventsTable.sessionId, sessionId));
  }

  if (noteId) {
    filters.push(eq(projectNoteEventsTable.noteId, noteId));
  }

  if (type) {
    filters.push(eq(projectNoteEventsTable.type, type));
  }

  const whereClause = combineFilters(filters);
  const items = getDrizzleDb(sqlite)
    .select({
      emitted_at: projectNoteEventsTable.emittedAt,
      event_id: projectNoteEventsTable.eventId,
      note_id: projectNoteEventsTable.noteId,
      payload_json: projectNoteEventsTable.payloadJson,
      project_id: projectNoteEventsTable.projectId,
      session_id: projectNoteEventsTable.sessionId,
      source: projectNoteEventsTable.source,
      type: projectNoteEventsTable.type,
    })
    .from(projectNoteEventsTable)
    .where(whereClause)
    .orderBy(desc(projectNoteEventsTable.sequence))
    .limit(pageSize)
    .offset(offset)
    .all() as NoteEventRow[];

  const total = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectNoteEventsTable)
    .where(whereClause)
    .get() as { count: number };

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

  const row = getDrizzleDb(sqlite)
    .select({
      sequence: projectNoteEventsTable.sequence,
    })
    .from(projectNoteEventsTable)
    .where(eq(projectNoteEventsTable.eventId, sinceEventId))
    .get() as { sequence: number } | undefined;

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

  const filters: SQL<unknown>[] = [
    eq(projectNoteEventsTable.projectId, projectId),
    sql`${projectNoteEventsTable.sequence} > ${resolveSinceSequence(sqlite, sinceEventId)}`,
  ];

  if (sessionId) {
    filters.push(eq(projectNoteEventsTable.sessionId, sessionId));
  }

  if (noteId) {
    filters.push(eq(projectNoteEventsTable.noteId, noteId));
  }

  if (type) {
    filters.push(eq(projectNoteEventsTable.type, type));
  }

  const rows = getDrizzleDb(sqlite)
    .select({
      emitted_at: projectNoteEventsTable.emittedAt,
      event_id: projectNoteEventsTable.eventId,
      note_id: projectNoteEventsTable.noteId,
      payload_json: projectNoteEventsTable.payloadJson,
      project_id: projectNoteEventsTable.projectId,
      sequence: projectNoteEventsTable.sequence,
      session_id: projectNoteEventsTable.sessionId,
      source: projectNoteEventsTable.source,
      type: projectNoteEventsTable.type,
    })
    .from(projectNoteEventsTable)
    .where(combineFilters(filters))
    .orderBy(asc(projectNoteEventsTable.sequence))
    .limit(limit)
    .all() as NoteEventRow[];

  return rows.map(mapNoteEventRow);
}
