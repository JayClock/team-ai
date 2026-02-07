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

export type Diagram = Entity<
  {
    id: string;
    title: string;
    type: DiagramType;
    viewport: Viewport;
    projectId: string;
  },
  {
    self: Diagram;
    nodes: Collection<DiagramNode>;
    edges: Collection<DiagramEdge>;
    'add-node': DiagramNode;
    'add-edge': DiagramEdge;
    project: Project;
  }
>;
