import { Entity } from '@hateoas-ts/resource';
import { LogicalEntity } from './logical-entity.js';

export const NODE_COMPONENT_TYPES = {
  FULFILLMENT: 'fulfillment-node',
  GROUP: 'group-container',
  NOTE: 'sticky-note',
} as const;

export type DiagramNode = Entity<
  {
    id: string;
    type: string;
    logicalEntity: { id: string } | null;
    parent: { id: string } | null;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    localData: LogicalEntity['data'];
  },
  {
    self: DiagramNode;
    diagram: Entity;
    'logical-entity': LogicalEntity;
    parent: Entity;
  }
>;
