import { Entity } from '@hateoas-ts/resource';
import { Diagram } from './diagram.js';
import { DiagramNode } from './node.js';

export type EdgeRelationType =
  | 'sequence'
  | 'triggers'
  | 'participates'
  | 'involves'
  | 'plays'
  | 'abstracts'
  | 'belongs_to'
  | 'references'
  | 'ASSOCIATION'
  | 'INHERITANCE'
  | 'AGGREGATION'
  | 'COMPOSITION'
  | 'DEPENDENCY'
  | 'REALIZATION'
  | 'FLOW';

export type EdgeStyleProps = {
  lineStyle?: string;
  color?: string;
  arrowType?: string;
  lineWidth?: number;
};

export type DiagramEdge = Entity<
  {
    id: string;
    sourceNode: { id: string };
    targetNode: { id: string };
    sourceHandle?: string;
    targetHandle?: string;
    relationType: EdgeRelationType;
    label?: string;
    styleProps?: EdgeStyleProps;
  },
  {
    self: DiagramEdge;
    diagram: Diagram;
    'source-node': DiagramNode;
    'target-node': DiagramNode;
  }
>;
