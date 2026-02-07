import { Collection, Entity } from '@hateoas-ts/resource';
import { Conversation } from './conversation.js';
import { Diagram } from './diagram.js';
import { LogicalEntity } from './logical-entity.js';

export type Project = Entity<
  {
    id: string;
    name: string;
  },
  {
    conversations: Collection<Conversation>;
    diagrams: Collection<Diagram>;
    'logical-entities': Collection<LogicalEntity>;
    'create-digram': Diagram;
    default: Project;
  }
>;
