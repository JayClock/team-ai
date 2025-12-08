import { Entity } from '../archtype/entity.js';
import { ResourceState } from '../state/resource-state.js';
import { RequestOptions, Resource } from './resource.js';
import { StateResource } from './state-resource.js';
import { BaseResource } from './base-resource.js';
import { Axios } from 'axios';
import { Link } from '../links/link.js';

export class LinkResource<TEntity extends Entity>
  extends BaseResource
  implements Resource<TEntity>
{
  constructor(
    axios: Axios,
    private readonly link: Link,
    private readonly rels: string[] = [],
    optionsMap: Map<string, RequestOptions> = new Map()
  ) {
    super(axios, optionsMap);
    this.link.rel = this.link.rel ?? 'ROOT_REL';
    this.link.type = 'GET';
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    return new LinkResource(
      this.axios,
      this.link,
      this.rels.concat(rel as string),
      this.optionsMap
    );
  }

  withRequestOptions(options: RequestOptions): Resource<TEntity> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.isRootResource() ? this.link.rel : this.rels.at(-1)!;
    this.optionsMap.set(lastRel, options);
    return this;
  }

  async request(): Promise<ResourceState<TEntity>> {
    const state = await this.httpRequest(this.link);
    if (this.isRootResource()) {
      return state as unknown as ResourceState<TEntity>;
    }
    const stateResource = new StateResource<TEntity>(
      this.axios,
      state,
      this.rels,
      this.optionsMap
    );
    return stateResource.request();
  }

  private isRootResource() {
    return this.rels.length === 0;
  }
}
