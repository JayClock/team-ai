import { Entity } from './entity.js';
import { ResourceState } from '../state/resource-state.js';

export interface Resource<TEntity extends Entity> {
  get(): Promise<ResourceState<TEntity>>;
  post<TData = unknown>(data: TData): Promise<ResourceState<TEntity>>;
  put<TData = unknown>(data: TData): Promise<ResourceState<TEntity>>;
  delete(): Promise<ResourceState<TEntity>>;
  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): Resource<TEntity['relations'][K]>;
}
