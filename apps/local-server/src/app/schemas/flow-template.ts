import type { NoteType } from './note';

export interface FlowTemplatePayload {
  content: string;
  description: string | null;
  id: string;
  name: string;
  noteType: NoteType;
  source: {
    libraryId: string | null;
    path: string;
    scope: 'builtin' | 'library' | 'user' | 'workspace';
  };
}

export interface FlowTemplateListPayload {
  items: FlowTemplatePayload[];
  noteType?: NoteType;
  projectId?: string;
}
