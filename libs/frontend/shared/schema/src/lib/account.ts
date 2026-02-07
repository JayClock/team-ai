import { Entity } from '@hateoas-ts/resource';

export type Account = Entity<
  { id: string; provider: string; providerId: string },
  { self: Account }
>;
