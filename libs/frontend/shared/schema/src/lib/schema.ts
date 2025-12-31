import { Collection, Entity } from '@hateoas-ts/resource';

export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>;
    conversations: Collection<Conversation>;
    'create-conversation': Conversation;
  }
>;

export type Account = Entity<
  { id: string; provider: string; providerId: string },
  { self: Account }
>;

export type Conversation = Entity<
  { id: string; title: string },
  { self: Conversation; user: User }
>;
