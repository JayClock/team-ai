import { Entity } from '@hateoas-ts/resource';
import { LogicalEntity } from './logical-entity.js';

export const NODE_COMPONENT_TYPES = {
  FULFILLMENT: 'fulfillment-node',
  GROUP: 'group-container',
  NOTE: 'sticky-note',
} as const;

export type NodeComponentType = string;

export type NodeLocalData = Record<string, unknown>;

export type DiagramNodeData = {
  id: string;
  type: NodeComponentType;
  logicalEntity?: { id: string } | null;
  parent?: { id: string } | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  localData: NodeLocalData;
};

export type DiagramNode = Entity<
  DiagramNodeData,
  {
    self: DiagramNode;
    diagram: Entity;
    'logical-entity': LogicalEntity;
    parent?: Entity;
  }
>;
