import { Client } from './client.js';
import { Entity } from './archtype/entity.js';
import { RelationResource } from './relation-resource.js';
import { HalStateFactory } from './state/hal.js';
import { HalResource } from 'hal-types';
import { ResourceState } from './state/resource-state.js';
import { Resource } from './archtype/resource-like.js';

export class RootResource<TEntity extends Entity> implements Resource<TEntity> {
  constructor(private readonly client: Client, private readonly uri: string) {}

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): RelationResource<TEntity['relations'][K]> {
    return new RelationResource(this.client, this.uri, [rel as string]);
  }

  async get(): Promise<ResourceState<TEntity>> {
    const response = await this.client.fetch(this.uri);
    return HalStateFactory<TEntity>(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    );
  }
}
