import { ClientInstance } from '../client-instance.js';
import { Link, LinkVariables } from '../links/link.js';
import { ResourceOptions } from './interface.js';
import { Entity } from '../archtype/entity.js';
import { HttpMethod } from '../http/util.js';
import { State } from '../state/state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { BaseState } from '../state/base-state.js';
import { expand } from '../util/uri-template.js';
import { resolve } from '../util/uri.js';
import { Links } from '../links/links.js';

export class ResourceRelation<TEntity extends Entity> {
  constructor(
    private readonly client: ClientInstance,
    private readonly link: Link,
    private readonly rels: string[],
    private readonly optionsMap: Map<string, ResourceOptions> = new Map(),
  ) {}

  async request(): Promise<State<TEntity>> {
    const rootState = await this.client.go<TEntity>(this.link).request();
    return this.resolveRelationsRecursively(rootState, this.rels);
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
    const rel = this.rels.at(1)!;
    const currentOptions = this.optionsMap.get(rel) ?? {};
    return { rel, currentOptions };
  }

  private async resolveRelationsRecursively(
    currentState: State<SafeAny>,
    remainingRels: string[],
  ): Promise<State<SafeAny>> {
    // Base case: no more relations to process
    if (remainingRels.length === 0) {
      return currentState;
    }

    const [currentRel, ...nextRels] = remainingRels;
    const link = currentState.getLink(currentRel);

    if (!link) {
      throw new Error(`Relation ${currentRel} not found`);
    }

    const embedded = (currentState as BaseState<TEntity>).getEmbedded(link.rel);
    const { rel, currentOptions } = this.getCurrentOptions();
    const { query } = currentOptions;
    const resource = this.client.go({ ...link, href: expand(link, query) });
    let nextState: State<SafeAny>;

    if (Array.isArray(embedded)) {
      nextState = new BaseState({
        client: this.client,
        uri: resolve(link),
        data: {},
        collection: embedded,
        links: new Links(this.client.bookmarkUri),
        headers: new Headers(),
      });
      this.client.cacheState(nextState);
    } else if (embedded) {
      nextState = embedded;
      this.client.cacheState(nextState);
    } else {
      const { method = 'GET' } = currentOptions;
      // If no embedded data is available, make an HTTP request
      const form = currentState.getForm(rel, method);
      nextState = await resource.request({}, form);
    }
    return this.resolveRelationsRecursively(nextState, nextRels);
  }
}
