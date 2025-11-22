import { Entity } from './archtype/entity.js';
import { Client } from './client.js';
import { HalState } from './state/hal-state.js';
import { State } from './state/state.js';
import { Links } from './links.js';

import { SafeAny } from './archtype/safe-any.js';
import { ResourceState } from './state/resource-state.js';
import { Resource } from './archtype/resource-like.js';

export class RelationResource<TEntity extends Entity>
  implements Resource<TEntity>
{
  constructor(
    private readonly client: Client,
    private readonly rootUri: string,
    private readonly rels: string[]
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
    const { penultimateState, link } = await this.getLastStateAndLink();
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
    return this.client.go<TEntity>(link.href).get(link.rel);
  }

  async post<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).post(data);
  }

  async put<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).put(data);
  }

  async delete(): Promise<ResourceState<TEntity>> {
    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).delete();
  }

  private async getLastStateAndLink() {
    const penultimateState =
      (await this.getPenultimateState()) as HalState<SafeAny>;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const link = penultimateState.links.get(lastRel)!;
    return { penultimateState, link };
  }

  private async getPenultimateState(): Promise<State<SafeAny>> {
    const pathToPenultimate = this.rels.slice(0, -1);
    return this.resolve(pathToPenultimate);
  }

  private async resolve(rels: string[]): Promise<State<SafeAny>> {
    const initialResource = this.client.go(this.rootUri);
    let currentState = (await initialResource.get()) as State<SafeAny>;
    for (const rel of rels) {
      const nextResource = this.client.go(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        currentState.links.get(rel as string)!.href
      );
      currentState = (await nextResource.get()) as State<SafeAny>;
    }
    return currentState;
  }
}
