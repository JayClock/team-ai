import { Entity } from '@hateoas-ts/resource';
import { LogicalEntity } from './logical-entity.js';

export type DiagramNode = Entity<
  {
    id: string;
    diagramId: string;
    type: string;
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
