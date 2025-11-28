import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { HalState } from '../state/hal-state.js';
import { State } from '../state/state.js';
import { Links } from '../links.js';
import { HalStateFactory } from '../state/hal.js';
import { HalResource } from 'hal-types';

import { SafeAny } from '../archtype/safe-any.js';
import { ResourceState } from '../state/resource-state.js';

export class Resource<TEntity extends Entity> {
  constructor(
    private readonly client: Client,
    private readonly uri: string,
    private readonly rels: string[]
  ) {}

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    return new Resource(this.client, this.uri, this.rels.concat(rel as string));
  }

  async get(): Promise<ResourceState<TEntity>> {
    if (this.isRootResource()) {
      const response = await this.client.fetch(this.uri);
      return HalStateFactory<TEntity>(
        this.client,
        this.uri,
        (await response.json()) as HalResource
      );
    }

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
    return this.client.go<TEntity>(link.href).get();
  }

  async post<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    if (this.isRootResource()) {
      const response = await this.client.fetch(this.uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      return HalStateFactory<TEntity>(
        this.client,
        this.uri,
        (await response.json()) as HalResource
      );
    }

    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).post(data);
  }

  async put<TData = unknown>(data: TData): Promise<ResourceState<TEntity>> {
    if (this.isRootResource()) {
      const response = await this.client.fetch(this.uri, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      return HalStateFactory<TEntity>(
        this.client,
        this.uri,
        (await response.json()) as HalResource
      );
    }

    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).put(data);
  }

  async delete(): Promise<ResourceState<TEntity>> {
    if (this.isRootResource()) {
      const response = await this.client.fetch(this.uri, {
        method: 'DELETE',
      });

      return HalStateFactory<TEntity>(
        this.client,
        this.uri,
        (await response.json()) as HalResource
      );
    }

    const { link } = await this.getLastStateAndLink();
    return this.client.go<TEntity>(link.href).delete();
  }

  private isRootResource() {
    return this.rels.length === 0;
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
    const initialResource = this.client.go(this.uri);
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
