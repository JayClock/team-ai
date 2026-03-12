import { Collection, Entity } from '@hateoas-ts/resource';

export type NoteType = 'spec' | 'task' | 'general';

export type NoteFormat = 'markdown';

export type NoteSource = 'user' | 'agent' | 'system';

export type Note = Entity<
  {
    id: string;
    projectId: string;
    sessionId: string | null;
    type: NoteType;
    title: string;
    content: string;
    format: NoteFormat;
    parentNoteId: string | null;
    linkedTaskId: string | null;
    assignedAgentIds: string[];
    source: NoteSource;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Note;
    collection: NoteCollection;
    project: never;
    session: never;
    parent: never;
    task: never;
  }
>;

export type NoteCollection = Entity<
  Collection<Note>['data'],
  Collection<Note>['links']
>;
