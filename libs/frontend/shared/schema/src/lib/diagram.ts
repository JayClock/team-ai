import { Collection, Entity } from '@hateoas-ts/resource';
import { DiagramNode } from './node.js';
import { DiagramEdge } from './edge.js';
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

export type DraftDiagramNode = DiagramNode['data'];

export type DraftDiagramEdge = DiagramEdge['data'];

export type DraftDiagramModel = Entity<{
  nodes: DraftDiagramNode[];
  edges: DraftDiagramEdge[];
}>;

export type ProposeModelStream = Entity<ReadableStream<Uint8Array>>;

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
    'propose-model': ProposeModelStream;
    'commit-draft': CommitDraftDiagramModel;
    project: Project;
  }
>;
