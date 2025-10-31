import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';
import { BaseState } from './state/base-state.js';
import { State } from './state/interface.js';
import { Links } from './links.js';

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
    const penultimateState =
      (await this._getPenultimateState()) as BaseState<any>;
    const lastRel = this.rels.at(-1)!;
    const embedded = penultimateState.getEmbedded(lastRel);
    if (Array.isArray(embedded)) {
      return new BaseState({
        client: this.client,
        data: {},
        collection: embedded,
        uri: penultimateState.getLink(lastRel)!.href,
        links: new Links(),
      });
    }
    if (embedded) {
      return embedded as State<any>;
    }
    const resource = this.client.root(
      penultimateState.links.get(lastRel as string)!.href
    );
    return (await resource.get(lastRel)) as State<TSchema>;
  }

  private async _getPenultimateState(): Promise<State<any>> {
    const pathToPenultimate = this.rels.slice(0, -1);
    return this._resolve(pathToPenultimate);
  }

  private async _resolve(rels: string[]): Promise<State<any>> {
    const initialResource = this.client.root(this.rootUri);
    let currentState = await initialResource.get();
    for (const rel of rels) {
      const nextResource = this.client.root(
        currentState.links.get(rel as string)!.href
      );
      currentState = await nextResource.get(rel);
    }
    return currentState;
  }
}
