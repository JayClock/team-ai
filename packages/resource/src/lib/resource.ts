import { Client } from './client.js';
import { Entity } from './archtype/entity.js';
import { Relation } from './relation.js';
import { HalStateFactory } from './state/hal.js';
import { HalResource } from 'hal-types';
import { State } from './state/interface.js';

export class Resource<TEntity extends Entity> {
  constructor(readonly client: Client, readonly uri: string) {}

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): Relation<TEntity['relations'][K]> {
    return new Relation(this.client, this.uri, [rel as string]);
  }

  async get(): Promise<State<TEntity>> {
    const response = await this.client.fetch(this.uri);
    return HalStateFactory<TEntity>(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    );
  }
}
