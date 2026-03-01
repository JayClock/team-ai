import { Collection, Entity } from '@hateoas-ts/resource';
import { Account } from './account.js';
import { Project } from './project.js';

export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>;
    'default-project': Project;
    projects: Collection<Project>;
  }
>;
