import type { RoleValue } from './role';

export interface SpecialistPayload {
  description: string | null;
  id: string;
  modelTier: string | null;
  name: string;
  role: RoleValue;
  source: {
    path: string;
    scope: 'builtin' | 'user' | 'workspace';
  };
  systemPrompt: string;
}

export interface SpecialistListPayload {
  items: SpecialistPayload[];
  projectId?: string;
}
