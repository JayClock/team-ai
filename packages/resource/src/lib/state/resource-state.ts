import { Entity } from '../archtype/entity.js';
import { State } from './state.js';
import { IsCollectionType } from './state-collection.js';
import { StateCollection } from './state-collection.js';

export type ResourceState<TEntity extends Entity = Entity> = Omit<
  State<TEntity>,
  'data' | 'collection' | 'links' | 'follow' | 'getForm'
> &
  (keyof TEntity['description'] extends never
    ? unknown
    : { data: TEntity['description'] }) &
  (IsCollectionType<TEntity> extends true
    ? { collection: StateCollection<TEntity> }
    : unknown) &
  (keyof TEntity['relations'] extends never
    ? unknown
    : Pick<State<TEntity>, 'links' | 'follow' | 'getForm'>);
