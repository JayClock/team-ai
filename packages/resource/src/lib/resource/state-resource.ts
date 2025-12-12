import { Entity } from '../archtype/entity.js';
import { Resource, ResourceOptions } from './resource.js';
import { State } from '../state/state.js';
import { BaseState } from '../state/base-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { BaseResource } from './base-resource.js';
import { ClientInstance } from '../client-instance.js';
import { Links } from '../links/links.js';
import { LinkVariables } from '../links/link.js';
import { resolve } from '../util/uri.js';
import { LinkResource } from './link-resource.js';
import { expand } from '../util/uri-template.js';

export class StateResource<
  TEntity extends Entity
> extends BaseResource<TEntity> {
  constructor(
    client: ClientInstance,
    private state: State,
    private rels: string[] = [],
    optionsMap: Map<string, ResourceOptions> = new Map()
  ) {
    super(client, optionsMap);
  }

  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]> {
    this.initRequestOptionsWithRel(rel as string, { query: variables });
    return new StateResource(
      this.client,
      this.state,
      this.rels.concat(rel as string),
      this.optionsMap
    );
  }

  async request(): Promise<State<TEntity>> {
    if (this.rels.length === 0) {
      throw new Error('No relations to follow');
    }
    return await this.resolveRelationsRecursively(this.state, this.rels);
  }

  private async resolveRelationsRecursively(
    currentState: State<SafeAny>,
    remainingRels: string[]
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
    } else if (embedded) {
      nextState = embedded;
    } else {
      const { method = 'GET' } = currentOptions;
      // If no embedded data is available, make an HTTP request
      const form = currentState.getForm(rel, method);
      nextState = await this.updateLinkResource(
        resource,
        currentOptions
      ).request(form);
    }

    this.client.cacheState(nextState);

    return this.resolveRelationsRecursively(nextState, nextRels);
  }

  private updateLinkResource(
    resource: Resource<SafeAny>,
    currentOptions: ResourceOptions
  ): LinkResource<SafeAny> {
    const { method } = currentOptions;

    switch (method) {
      case 'GET':
        resource.withGet(currentOptions);
        break;
      case 'POST':
        resource.withPost(currentOptions);
        break;
      case 'PUT':
        resource.withPut(currentOptions);
        break;
      case 'PATCH':
        resource.withPatch(currentOptions);
        break;
      case 'DELETE':
        resource.withDelete();
        break;
      default:
        resource.withGet(currentOptions);
    }
    return resource as LinkResource<SafeAny>;
  }

  getCurrentOptions(): {
    rel: string;
    currentOptions: ResourceOptions;
  } {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentOptions = this.optionsMap.get(rel)!;
    return { rel, currentOptions };
  }
}
