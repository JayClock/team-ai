import { RelationResource } from '../relation-resource.js';
import { Entity } from './entity.js';
import { ResourceState } from '../state/resource-state.js';

export interface Resource<TEntity extends Entity> {
  get(): Promise<ResourceState<TEntity>>;
  post<TData = unknown>(data: TData): Promise<ResourceState<TEntity>>;
  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): RelationResource<TEntity['relations'][K]>;
}
