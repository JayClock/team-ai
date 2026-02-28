import { Collection, Entity } from '@hateoas-ts/resource';
import { Conversation } from './conversation.js';
import { Diagram } from './diagram.js';
import { LogicalEntity } from './logical-entity.js';
import { Sidebar } from './sidebar.js';

export type Project = Entity<
  {
    id: string;
    name: string;
  },
  {
    self: Project;
    conversations: Collection<Conversation>;
    diagrams: Collection<Diagram>;
    'logical-entities': Collection<LogicalEntity>;
    sidebar: Sidebar;
    'create-digram': Diagram;
    default: Project;
  }
>;
