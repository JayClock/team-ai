import { BaseSchema } from './base-schema.js';
import { Client } from './client.js';
import { BaseState } from './state/base-state.js';
import { State } from './state/interface.js';
import { Link, Links } from './links.js';
import { HalStateFactory } from './state/hal.js';
import { HalResource } from 'hal-types';

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

  async invoke(): Promise<State<TSchema>> {
    const penultimateState =
      (await this.getPenultimateState()) as BaseState<any>;
    const lastRel = this.rels.at(-1)!;
    const link = penultimateState.links.get(lastRel)!;
    switch (link.type) {
      case 'GET':
        return this.get(penultimateState, link);
      default:
        throw new Error(`Unimplemented method type ${link.type}`);
    }
  }

  private async get(
    penultimateState: BaseState<any>,
    link: Link
  ): Promise<State<TSchema>> {
    const embedded = penultimateState.getEmbedded(link.rel);
    if (Array.isArray(embedded)) {
      return new BaseState({
        client: this.client,
        data: {},
        collection: embedded,
        uri: link.href,
        links: new Links(),
      });
    }
    if (embedded) {
      return embedded as State<any>;
    }
    const response = await this.client.fetch(link.rel);
    return HalStateFactory<TSchema>(
      this.client,
      link.href,
      (await response.json()) as HalResource,
      link.rel
    );
  }

  private async getPenultimateState(): Promise<State<any>> {
    const pathToPenultimate = this.rels.slice(0, -1);
    return this.resolve(pathToPenultimate);
  }

  private async resolve(rels: string[]): Promise<State<any>> {
    const initialResource = this.client.root(this.rootUri);
    let currentState = await initialResource.get();
    for (const rel of rels) {
      const nextResource = this.client.root(
        currentState.links.get(rel as string)!.href
      );
      currentState = await nextResource.get();
    }
    return currentState;
  }
}
