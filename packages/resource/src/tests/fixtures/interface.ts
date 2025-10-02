import { BaseSchema, Collection } from '../../lib/base-schema.js';

export interface User extends BaseSchema {
  description: { id: string; name: string; email: string };
  relations: {
    self: User;
    accounts: Collection<Account>;
    conversations: Collection<Conversation>;
    'create-conversation': Conversation;
    'latest-conversation': Conversation;
  };
}

export interface Account extends BaseSchema {
  description: { id: string; provider: string; providerId: string };
  relations: { self: Account };
}

export interface Conversation extends BaseSchema {
  description: { id: string; title: string };
  relations: { self: Conversation };
}
