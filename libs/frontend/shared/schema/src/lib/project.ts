import { Collection, Entity } from '@hateoas-ts/resource';
import { AgentCollection } from './agent.js';
import { AgentEventCollection } from './agent-event.js';
import { Conversation } from './conversation.js';
import { Diagram } from './diagram.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { LogicalEntity } from './logical-entity.js';
import { Sidebar } from './sidebar.js';
import { TaskCollection } from './task.js';

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
    agents: AgentCollection;
    conversations: Collection<Conversation>;
    diagrams: DiagramCollection;
    events: AgentEventCollection;
    'events-stream': Entity<ReadableStream<Uint8Array>>;
    'knowledge-graph': KnowledgeGraph;
    'logical-entities': Collection<LogicalEntity>;
    sidebar: Sidebar;
    tasks: TaskCollection;
    default: Project;
  }
>;
