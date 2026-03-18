import { Collection, Entity } from '@hateoas-ts/resource';
import type { RoleValue } from './role.js';

export type Specialist = Entity<
  {
    id: string;
    name: string;
    description: string | null;
    defaultAdapter: string | null;
    role: RoleValue;
    modelTier: string | null;
    roleReminder: string | null;
    systemPrompt: string;
    source: {
      libraryId?: string | null;
      path: string;
      scope: 'builtin' | 'library' | 'workspace' | 'user';
    };
  },
  {
    self: Specialist;
    collection: SpecialistCollection;
  }
>;

export type SpecialistCollection = Entity<
  Collection<Specialist>['data'],
  Collection<Specialist>['links']
>;
