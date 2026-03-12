import { Collection, Entity } from '@hateoas-ts/resource';
import type { NoteSource, NoteType } from './note.js';

export type NoteEventType = 'created' | 'updated' | 'deleted';

export type NoteEventNote = {
  assignedAgentIds: string[];
  content: string;
  createdAt: string;
  format: 'markdown';
  id: string;
  linkedTaskId: string | null;
  parentNoteId: string | null;
  projectId: string;
  sessionId: string | null;
  source: NoteSource;
  title: string;
  type: NoteType;
  updatedAt: string;
};

export type NoteEvent = Entity<
  {
    eventId: string;
    noteId: string;
    projectId: string;
    sessionId: string | null;
    type: NoteEventType;
    emittedAt: string;
    data: {
      note: NoteEventNote;
      source: NoteSource;
    };
  },
  {
    collection: NoteEventCollection;
    note: never;
    project: never;
  }
>;

export type NoteEventCollection = Entity<
  Collection<NoteEvent>['data'],
  Collection<NoteEvent>['links']
>;
