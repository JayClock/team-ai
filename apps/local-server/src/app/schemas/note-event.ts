import type { NotePayload, NoteSource } from './note';

export type NoteEventType = 'created' | 'updated' | 'deleted';

export interface NoteEventEnvelopePayload {
  data: {
    note: NotePayload;
    source: NoteSource;
  };
  emittedAt: string;
  eventId: string;
  noteId: string;
  projectId: string;
  sessionId: string | null;
  type: NoteEventType;
}

export interface NoteEventListPayload {
  items: NoteEventEnvelopePayload[];
  noteId?: string;
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  total: number;
  type?: NoteEventType;
}
