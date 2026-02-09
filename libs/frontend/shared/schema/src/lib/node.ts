import { Entity } from '@hateoas-ts/resource';
import { LogicalEntity } from './logical-entity.js';

export const NODE_COMPONENT_TYPES = {
  FULFILLMENT: 'fulfillment-node',
  GROUP: 'group-container',
  NOTE: 'sticky-note',
} as const;

export type NodeComponentType =
  (typeof NODE_COMPONENT_TYPES)[keyof typeof NODE_COMPONENT_TYPES];

export type DiagramNode = Entity<
  {
    id: string;
    diagramId: string;
    type: NodeComponentType;
    logicalEntityId: string;
    parentId: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  },
  {
    self: DiagramNode;
    diagram: Entity;
    'logical-entity': LogicalEntity;
    parent?: Entity;
  }
>;
