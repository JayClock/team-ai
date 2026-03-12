import { Collection, Entity } from '@hateoas-ts/resource';
import type { RoleValue } from './role.js';

export type Specialist = Entity<
  {
    id: string;
    name: string;
    description: string | null;
    role: RoleValue;
    modelTier: string | null;
    systemPrompt: string;
    source: {
      path: string;
      scope: 'builtin' | 'workspace' | 'user';
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
