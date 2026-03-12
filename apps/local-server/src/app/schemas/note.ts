export type NoteType = 'spec' | 'task' | 'general';

export type NoteFormat = 'markdown';

export type NoteSource = 'user' | 'agent' | 'system';

export interface NotePayload {
  assignedAgentIds: string[];
  content: string;
  createdAt: string;
  format: NoteFormat;
  id: string;
  linkedTaskId: string | null;
  parentNoteId: string | null;
  projectId: string;
  sessionId: string | null;
  source: NoteSource;
  title: string;
  type: NoteType;
  updatedAt: string;
}

export interface NoteListPayload {
  items: NotePayload[];
  page: number;
  pageSize: number;
  projectId: string;
  sessionId?: string;
  total: number;
  type?: NoteType;
}

export interface CreateNoteInput {
  assignedAgentIds?: string[];
  content?: string;
  format?: NoteFormat;
  linkedTaskId?: string | null;
  parentNoteId?: string | null;
  projectId: string;
  sessionId?: string | null;
  source?: NoteSource;
  title: string;
  type?: NoteType;
}

export interface UpdateNoteInput {
  assignedAgentIds?: string[];
  content?: string;
  format?: NoteFormat;
  linkedTaskId?: string | null;
  parentNoteId?: string | null;
  sessionId?: string | null;
  source?: NoteSource;
  title?: string;
  type?: NoteType;
}
