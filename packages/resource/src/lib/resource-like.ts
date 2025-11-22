import { Relation } from './relation.js';
import { Resource } from './resource.js';
import { Entity } from './archtype/entity.js';

export type ResourceLike<TEntity extends Entity> =
  | Resource<TEntity>
  | Relation<TEntity>;
