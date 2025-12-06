import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { HalState } from '../state/hal-state.js';
import { State } from '../state/state.js';
import { Link, Links, LinkVariables } from '../links.js';
import { HalStateFactory } from '../state/hal.js';
import { HalResource } from 'hal-types';

import { SafeAny } from '../archtype/safe-any.js';
import { ResourceState } from '../state/resource-state.js';
import { parseTemplate } from 'url-template';

export class Resource<TEntity extends Entity> {
  constructor(
    private readonly client: Client,
    private readonly link: Link,
    private readonly rels: string[] = [],
    private readonly map: Map<string, LinkVariables> = new Map()
  ) {
    this.link.rel = this.link.rel ?? 'ROOT_REL';
    this.link.type = 'GET';
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    return new Resource(
      this.client,
      this.link,
      this.rels.concat(rel as string)
    );
  }

  withTemplateParameters(parameters: LinkVariables) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.isRootResource() ? this.link.rel : this.rels.at(-1)!;
    this.map.set(lastRel, parameters);
    return this;
  }

  async request(
    data?: Record<string, SafeAny>
  ): Promise<ResourceState<TEntity>> {
    let link!: Link;

    if (this.isRootResource()) {
      link = this.link;
    } else {
      const penultimateState =
        (await this.getPenultimateState()) as HalState<SafeAny>;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lastRel = this.rels.at(-1)!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      link = penultimateState.links.get(lastRel)!;

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
    }

    const uri = this.expandLink(link);
    const response = await this.client.fetch(uri, {
      method: link.type,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return HalStateFactory<TEntity>(
      this.client,
      uri,
      (await response.json()) as HalResource,
      link.rel
    );
  }

  private isRootResource() {
    return this.rels.length === 0;
  }

  private async getPenultimateState(): Promise<State<SafeAny>> {
    const pathToPenultimate = this.rels.slice(0, -1);
    return this.resolve(pathToPenultimate);
  }

  private async resolve(rels: string[]): Promise<State<SafeAny>> {
    const initialResource = this.client.go(this.link);
    let currentState = (await initialResource.request()) as State<SafeAny>;
    for (const rel of rels) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const link = currentState.links.get(rel as string)!;
      const nextResource = this.client.go({
        ...link,
        href: this.expandLink(link),
      });
      currentState = (await nextResource.request()) as State<SafeAny>;
    }
    return currentState;
  }

  private expandLink(link: Link) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const context = this.map.get(link.rel)!;
    this.map.delete(link.rel);
    return parseTemplate(link.href).expand(context);
  }
}
