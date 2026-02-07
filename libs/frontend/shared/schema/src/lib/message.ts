import { Entity } from '@hateoas-ts/resource';

export type Message = Entity<{
  id: string;
  role: 'user' | 'assistant';
  content: string;
}>;
