import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { HalState } from '../state/hal-state.js';
import { Link } from '../links.js';
import { HalResource } from 'hal-types';
import { ResourceState } from '../state/resource-state.js';
import { parseTemplate } from 'url-template';
import { RequestOptions, Resource } from './resource.js';
import { StateResource } from './state-resource.js';

export class LinkResource<TEntity extends Entity> implements Resource<TEntity> {
  constructor(
    private readonly client: Client,
    private readonly link: Link,
    private readonly rels: string[] = [],
    private readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {
    this.link.rel = this.link.rel ?? 'ROOT_REL';
    this.link.type = 'GET';
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    return new LinkResource(
      this.client,
      this.link,
      this.rels.concat(rel as string)
    );
  }

  withRequestOptions(options: RequestOptions): Resource<TEntity> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.isRootResource() ? this.link.rel : this.rels.at(-1)!;
    this.optionsMap.set(lastRel, options);
    return this;
  }

  async request(): Promise<ResourceState<TEntity>> {
    const context = this.getRequestOption(this.link);
    const uri = parseTemplate(this.link.href).expand(context.query ?? {});
    const response = await this.client.fetch(uri, {
      method: this.link.type,
      body: JSON.stringify(context.body),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const state = HalState.create<TEntity>(
      this.client,
      uri,
      (await response.json()) as HalResource,
      this.link.rel
    );
    if (this.isRootResource()) {
      return state;
    }
    const stateResource = new StateResource<TEntity>(
      this.client,
      state,
      this.rels,
      this.optionsMap
    );
    return stateResource.request();
  }

  private isRootResource() {
    return this.rels.length === 0;
  }

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }
}
