import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';

export class Relation<TSchema extends BaseSchema> {
  constructor(
    readonly client: Client,
    readonly rootUri: string,
    readonly refs: string[]
  ) {}

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    return new Relation(
      this.client,
      this.rootUri,
      this.refs.concat(rel as string)
    );
  }
}
