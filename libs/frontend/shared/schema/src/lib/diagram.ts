import { Collection, Entity } from '@hateoas-ts/resource';
import { DiagramNode } from './node.js';
import { DiagramEdge } from './edge.js';
import { LogicalEntityType } from './logical-entity.js';
import { Project } from './project.js';

export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'component'
  | 'state'
  | 'activity'
  | 'fulfillment';

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type DraftDiagramNode = {
  localData: {
    name: string;
    label: string;
    type: LogicalEntityType;
  };
};

export type DraftDiagramEdge = {
  sourceNode: {
    id: string;
  };
  targetNode: {
    id: string;
  };
};

export type DraftDiagramModel = Entity<{
  nodes: DraftDiagramNode[];
  edges: DraftDiagramEdge[];
}>;

export type CommitDraftDiagramModel = Entity<{
  nodes?: DiagramNode['data'][];
  edges?: DiagramEdge['data'][];
  nodeIdMapping?: Record<string, string>;
  logicalEntityIdMapping?: Record<string, string>;
}>;

export type Diagram = Entity<
  {
    id: string;
    title: string;
    type: DiagramType;
    viewport: Viewport;
  },
  {
    self: Diagram;
    nodes: Collection<DiagramNode>;
    edges: Collection<DiagramEdge>;
    'add-node': DiagramNode;
    'add-edge': DiagramEdge;
    'propose-model': DraftDiagramModel;
    'commit-draft': CommitDraftDiagramModel;
    project: Project;
  }
>;
