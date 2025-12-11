import { Entity } from '../archtype/entity.js';
import { RequestOptions, Resource } from './resource.js';
import { StateResource } from './state-resource.js';
import { BaseResource } from './base-resource.js';
import { LinkVariables, NewLink } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';

export class LinkResource<
  TEntity extends Entity
> extends BaseResource<TEntity> {
  constructor(
    client: ClientInstance,
    private readonly link: NewLink,
    private readonly rels: string[] = [],
    optionsMap: Map<string, RequestOptions> = new Map()
  ) {
    super(client, optionsMap);
    this.link.rel = this.link.rel ?? 'ROOT_REL';
  }

  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]> {
    this.initRequestOptionsWithRel(rel as string, { query: variables });
    return new LinkResource(
      this.client,
      this.link,
      this.rels.concat(rel as string),
      this.optionsMap
    );
  }

  getCurrentOptions() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.isRootResource() ? this.link.rel : this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const options = this.optionsMap.get(rel)!;
    return { rel, options };
  }

  async request(): Promise<State<TEntity>> {
    const state: State<TEntity> = await this.httpRequest({
      ...this.link,
      context: this.client.bookmarkUri,
    });
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
}
