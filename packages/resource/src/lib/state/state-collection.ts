import { Collection } from '../archtype/collection.js';
import { Entity } from '../archtype/entity.js';
import { State } from './state.js';

export type StateCollection<TEntity extends Entity> =
  IsCollectionType<TEntity> extends true
    ? State<ExtractCollectionElement<TEntity>>[]
    : State[];

export type IsCollectionType<T> = ExtractCollectionElement<T> extends never
  ? false
  : true;

export type ExtractCollectionElement<T> = T extends Collection<infer U>
  ? U
  : never;
