import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Relation } from './relation.js';
import { HalStateFactory } from './state/hal.js';
import { HalResource } from 'hal-types';
import { State } from './state/interface.js';

export class Resource<TSchema extends BaseSchema> {
  constructor(readonly client: Client, readonly uri: string) {}

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    return new Relation(this.client, this.uri, [rel as string]);
  }

  async get(): Promise<State<TSchema>> {
    const response = await this.fetch({ method: 'GET' });
    return HalStateFactory(
      this.client,
      this.uri,
      (await response.json()) as HalResource
    ) as State<TSchema>;
  }

  private fetch(init?: RequestInit): Promise<Response> {
    return this.client.fetch(this.uri, init);
  }
}
