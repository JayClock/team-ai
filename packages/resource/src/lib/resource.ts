import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Relation } from './relation.js';

export class Resource<TSchema extends BaseSchema> {
  constructor(readonly client: Client, readonly uri: string) {}

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    return new Relation(this.client, [rel as string]);
  }

  async get(): Promise<Response> {
    return await this.fetch();
  }

  private fetch(init?: RequestInit): Promise<Response> {
    return this.client.fetch(this.uri, init);
  }
}
