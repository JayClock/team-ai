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
  ): Resource<TEntity['relations'][K]> {
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

  async post<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    const response = await this.client.fetch(this.uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    return HalStateFactory<TEntity>(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    );
  }

  async put<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    const response = await this.client.fetch(this.uri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    return HalStateFactory<TEntity>(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    );
  }

  async delete(): Promise<ResourceState<TEntity>> {
    const response = await this.client.fetch(this.uri, {
      method: 'DELETE',
    });

    return HalStateFactory<TEntity>(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    );
  }
}
