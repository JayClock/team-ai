import { ClientInstance } from '../client-instance.js';
import { Link, LinkVariables } from '../links/link.js';
import { RequestOptions } from './interface.js';
import { Entity } from '../archtype/entity.js';
import { HttpMethod } from '../http/util.js';
import { State } from '../state/state.js';
import { BaseState } from '../state/base-state.js';
import { Links } from '../links/links.js';
import Resource from './resource.js';
import { SafeAny } from '../archtype/safe-any.js';

interface ResourceOptions {
  query?: Record<string, SafeAny>;
  method?: HttpMethod;
}

export class ResourceRelation<TEntity extends Entity> {
  constructor(
    private readonly client: ClientInstance,
    private readonly link: Link,
    private readonly rels: string[],
    private readonly optionsMap: Map<string, ResourceOptions> = new Map(),
  ) {}

  async request(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.request(requestOptions);
  }

  async getResource(): Promise<Promise<Resource<TEntity>>> {
    return this.getResourceWithRels(this.rels);
  }

  private async getResourceWithRels(
    rels: string[],
  ): Promise<Resource<TEntity>> {
    let resource: Resource<SafeAny> = this.client.go(this.link);
    let state: State<SafeAny> = await resource.request();
    for (const rel of rels) {
      const currentOptions = this.optionsMap.get(rel);
      resource = state
        .follow(rel)
        .withMethod(currentOptions?.method ?? 'GET')
        .withTemplateParameters(currentOptions?.query ?? {});

      const embedded = (state as BaseState<SafeAny>).getEmbedded(rel);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const link = state.links.get(rel)!;
      if (Array.isArray(embedded)) {
        state = new BaseState({
          client: this.client,
          data: {},
          collection: embedded,
          links: new Links(this.client.bookmarkUri),
          headers: new Headers(),
          currentLink: link,
        });
        this.client.cacheState(state);
      } else if (embedded) {
        state = embedded;
        this.client.cacheState(state);
      }
      state = await resource.request();
    }
    return resource;
  }

  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): ResourceRelation<TEntity['links'][K]> {
    return new ResourceRelation(
      this.client,
      this.link,
      this.rels.concat(rel as string),
      this.optionsMap,
    );
  }

  withTemplateParameters(variables: LinkVariables): ResourceRelation<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, query: variables });
    return this;
  }

  withMethod(method: HttpMethod): ResourceRelation<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, method: method });
    return this;
  }

  private getCurrentOptions() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.rels.at(-1)!;
    const currentOptions = this.optionsMap.get(rel) ?? {};
    return { rel, currentOptions };
  }
}
