import type { RoleValue } from './role';

export interface SpecialistPayload {
  defaultAdapter: string | null;
  description: string | null;
  id: string;
  modelTier: string | null;
  name: string;
  role: RoleValue;
  roleReminder: string | null;
  source: {
    libraryId?: string | null;
    path: string;
    scope: 'builtin' | 'library' | 'user' | 'workspace';
  };
  systemPrompt: string;
}

export interface SpecialistListPayload {
  items: SpecialistPayload[];
  projectId?: string;
}
