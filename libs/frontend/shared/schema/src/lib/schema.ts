import { Collection, Entity } from '@hateoas-ts/resource';

export type Root = Entity<
  never,
  {
    login: never;
    me: User;
    logout: never;
  }
>;

export type User = Entity<
  { id: string; name: string; email: string },
  {
    self: User;
    accounts: Collection<Account>;
    projects: Collection<Project>;
  }
>;

export type Project = Entity<
  {
    id: string;
    name: string;
  },
  {
    conversations: Collection<Conversation>;
    default: Project;
  }
>;

export type Account = Entity<
  { id: string; provider: string; providerId: string },
  { self: Account }
>;

export type Conversation = Entity<
  { id: string; title: string },
  { self: Conversation; messages: Collection<Message>; 'send-message': Entity }
>;

export type Message = Entity<{
  id: string;
  role: 'user' | 'assistant';
  content: string;
}>;
