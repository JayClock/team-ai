import { Entity } from '@hateoas-ts/resource';
import { Project } from './project.js';

export type KnowledgeGraphNode = {
  logicalEntityId: string;
  type: string;
  subType?: string;
  name: string;
  label?: string;
  description?: string;
};

export type KnowledgeGraphEdge = {
  diagramId: string;
  sourceLogicalEntityId: string;
  targetLogicalEntityId: string;
  relationType: string;
};

export type KnowledgeGraph = Entity<
  {
    projectId: string;
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
  },
  {
    self: KnowledgeGraph;
    project: Project;
  }
>;
