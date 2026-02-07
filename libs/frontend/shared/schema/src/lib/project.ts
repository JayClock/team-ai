import { Collection, Entity } from '@hateoas-ts/resource';
import { Conversation } from './conversation.js';

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
