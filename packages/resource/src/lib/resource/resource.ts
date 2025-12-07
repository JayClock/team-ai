import { Entity } from '../archtype/entity.js';
import { ResourceState } from '../state/resource-state.js';
import { SafeAny } from '../archtype/safe-any.js';

export interface RequestOptions {
  query?: Record<string, SafeAny>;
  body?: Record<string, SafeAny>;
}

export interface Resource<TEntity extends Entity> {
  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]>;

  request(): Promise<ResourceState<TEntity>>;

  withRequestOptions(options: RequestOptions): Resource<TEntity>;
}
