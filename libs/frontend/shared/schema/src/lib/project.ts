import { Collection, Entity } from '@hateoas-ts/resource';
import { AgentCollection } from './agent.js';
import { AgentEventCollection } from './agent-event.js';
import { Conversation } from './conversation.js';
import { Diagram } from './diagram.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { LogicalEntity } from './logical-entity.js';
import { NoteEventCollection } from './note-event.js';
import { NoteCollection } from './note.js';
import { RoleCollection } from './role.js';
import { AcpSessionCollection } from './session.js';
import { Sidebar } from './sidebar.js';
import { SpecialistCollection } from './specialist.js';
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
    title: string;
    description: string | null;
    repoPath: string | null;
    sourceType: 'github' | 'local' | null;
    sourceUrl: string | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Project;
    agents: AgentCollection;
    'acp-sessions': AcpSessionCollection;
    conversations: Collection<Conversation>;
    diagrams: DiagramCollection;
    events: AgentEventCollection;
    'events-stream': Entity<ReadableStream<Uint8Array>>;
    'knowledge-graph': KnowledgeGraph;
    'logical-entities': Collection<LogicalEntity>;
    notes: NoteCollection;
    'note-events': NoteEventCollection;
    roles: RoleCollection;
    sidebar: Sidebar;
    specialists: SpecialistCollection;
    tasks: TaskCollection;
    default: Project;
  }
>;
