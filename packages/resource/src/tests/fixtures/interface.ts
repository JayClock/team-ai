import { Collection } from 'src/lib/archtype/collection.js';
import { Entity } from '../../lib/archtype/entity.js';
import { Client } from 'src/lib/client.js';

export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>;
    conversations: Collection<Conversation>;
    'create-conversation': Conversation;
    'latest-conversation': Conversation;
  }
>;

export type Account = Entity<
  { id: string; provider: string; providerId: string },
  { self: Account }
>;

export type Conversation = Entity<
  { id: string; title: string },
  { self: Conversation }
>;

new Client({ baseURL: '' }).root<User>('');
