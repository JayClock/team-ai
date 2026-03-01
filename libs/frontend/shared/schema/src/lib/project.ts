import { Collection, Entity } from '@hateoas-ts/resource';
import { Conversation } from './conversation.js';
import { Diagram } from './diagram.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { LogicalEntity } from './logical-entity.js';
import { Sidebar } from './sidebar.js';

export type DiagramCollection = Entity<
  Collection<Diagram>['data'],
  Collection<Diagram>['links'] & {
    'create-diagram': Diagram;
  }
>;

export type Project = Entity<
  {
    id: string;
    name: string;
  },
  {
    self: Project;
    conversations: Collection<Conversation>;
    diagrams: DiagramCollection;
    'knowledge-graph': KnowledgeGraph;
    'logical-entities': Collection<LogicalEntity>;
    sidebar: Sidebar;
    default: Project;
  }
>;
