import { Collection, Entity } from '@hateoas-ts/resource';
import { Message } from './message.js';

export type Conversation = Entity<
  { id: string; title: string },
  { self: Conversation; messages: Collection<Message>; 'send-message': Entity }
>;
