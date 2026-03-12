import { Collection, Entity } from '@hateoas-ts/resource';

export type RoleValue = 'ROUTA' | 'CRAFTER' | 'GATE' | 'DEVELOPER';

export type Role = Entity<
  {
    id: RoleValue;
    name: string;
    description: string;
    responsibilities: string[];
  },
  {
    self: Role;
    collection: RoleCollection;
  }
>;

export type RoleCollection = Entity<
  Collection<Role>['data'],
  Collection<Role>['links']
>;
