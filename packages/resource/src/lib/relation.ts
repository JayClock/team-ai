import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';
import { State } from './state.js';

export class Relation<TSchema extends BaseSchema> {
  constructor(
    readonly client: Client,
    readonly rootUri: string,
    readonly rels: string[]
  ) {}

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    return new Relation(
      this.client,
      this.rootUri,
      this.rels.concat(rel as string)
    );
  }

  async get(): Promise<State<TSchema>> {
    const initialResource = this.client.go(this.rootUri);
    let currentState = await initialResource.get();
    for (const ref of this.rels) {
      const nextResource = currentState.follow(ref);
      currentState = await nextResource.get();
    }
    return currentState as State<TSchema>;
  }
}
