import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';
import { State } from './state/state.js';

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
    return (await this._resolve(this.rels)) as State<TSchema>;
  }

  // private async _getPenultimateState(): Promise<State<any>> {
  //   const pathToPenultimate = this.rels.slice(0, -1);
  //   return this._resolve(pathToPenultimate);
  // }

  private async _resolve(rels: string[]): Promise<State<any>> {
    const initialResource = this.client.go(this.rootUri);
    let currentState = await initialResource.get();
    for (const rel of rels) {
      const nextResource = currentState.follow(rel);
      currentState = await nextResource.get();
    }
    return currentState;
  }
}
