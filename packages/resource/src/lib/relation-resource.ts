import { Entity } from './archtype/entity.js';
import { Client } from './client.js';
import { HalState } from './state/hal-state.js';
import { State } from './state/state.js';
import { Links } from './links.js';
import { HalStateFactory } from './state/hal.js';
import { HalResource } from 'hal-types';
import { SafeAny } from './archtype/safe-any.js';
import { ResourceState } from './state/resource-state.js';
import { Resource } from './archtype/resource-like.js';

export class RelationResource<TEntity extends Entity> implements Resource<TEntity> {
  constructor(
    readonly client: Client,
    readonly rootUri: string,
    readonly rels: string[]
  ) {}

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): RelationResource<TEntity['relations'][K]> {
    return new RelationResource(
      this.client,
      this.rootUri,
      this.rels.concat(rel as string)
    );
  }

  async get(): Promise<ResourceState<TEntity>> {
    const penultimateState =
      (await this.getPenultimateState()) as HalState<SafeAny>;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const link = penultimateState.links.get(lastRel)!;
    const embedded = penultimateState.getEmbedded(link.rel);
    if (Array.isArray(embedded)) {
      return new HalState({
        client: this.client,
        data: {},
        collection: embedded,
        uri: link.href,
        links: new Links(),
      }) as unknown as ResourceState<TEntity>;
    }
    if (embedded) {
      return embedded as unknown as ResourceState<TEntity>;
    }
    const response = await this.client.fetch(link.rel);
    return HalStateFactory<TEntity>(
      this.client,
      link.href,
      (await response.json()) as HalResource,
      link.rel
    );
  }

  private async getPenultimateState(): Promise<State<SafeAny>> {
    const pathToPenultimate = this.rels.slice(0, -1);
    return this.resolve(pathToPenultimate);
  }

  private async resolve(rels: string[]): Promise<State<SafeAny>> {
    const initialResource = this.client.root(this.rootUri);
    let currentState = (await initialResource.get()) as State<SafeAny>;
    for (const rel of rels) {
      const nextResource = this.client.root(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        currentState.links.get(rel as string)!.href
      );
      currentState = (await nextResource.get()) as State<SafeAny>;
    }
    return currentState;
  }
}
