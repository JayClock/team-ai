import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';
import { BaseState } from './state/base-state.js';
import { State } from './state/interface.js';

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
    return await this._resolve(this.rels);
  }

  private async _resolve(rels: string[]): Promise<BaseState<any>> {
    const initialResource = this.client.go(this.rootUri);
    let currentState = (await initialResource.get()) as BaseState<any>;
    for (const rel of rels) {
      const nextResource = currentState.follow(rel);
      currentState = (await nextResource.get(rel)) as BaseState<any>;
    }
    return currentState;
  }
}
