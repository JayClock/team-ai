import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Relation } from './relation.js';
import { BaseState } from './state/base-state.js';
import { HalStateFactory } from './state/hal.js';

export class Resource<TSchema extends BaseSchema> {
  constructor(readonly client: Client, readonly uri: string) {}

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    return new Relation(this.client, this.uri, [rel as string]);
  }

  async get(): Promise<BaseState<TSchema>> {
    const response = await this.fetch({ method: 'GET' });
    return HalStateFactory(
      this.client,
      this.uri,
      response.json
    ) as BaseState<TSchema>;
  }

  private fetch(init?: RequestInit): Promise<Response> {
    return this.client.fetch(this.uri, init);
  }
}
