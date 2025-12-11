import { Entity } from '../archtype/entity.js';
import { RequestOptions, Resource } from './resource.js';
import { State } from '../state/state.js';
import { BaseState } from '../state/base-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { BaseResource } from './base-resource.js';
import { ClientInstance } from '../client-instance.js';
import { Links } from '../links/links.js';
import { LinkVariables } from '../links/link.js';

export class StateResource<
  TEntity extends Entity
> extends BaseResource<TEntity> {
  constructor(
    client: ClientInstance,
    private state: State,
    private rels: string[] = [],
    optionsMap: Map<string, RequestOptions> = new Map()
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

    let nextState: State<SafeAny>;

    if (Array.isArray(embedded)) {
      nextState = new BaseState({
        client: this.client,
        uri: new URL(link.href, this.client.bookmarkUri).toString(),
        data: {},
        collection: embedded,
        links: new Links(),
        headers: new Headers(),
      });
    } else if (embedded) {
      nextState = embedded;
    } else {
      const { rel, options } = this.getCurrentOptions();
      // If no embedded data is available, make an HTTP request
      nextState = await this.httpRequest(
        link,
        currentState.getForm(rel, options.method ?? 'GET')
      );
    }

    return this.resolveRelationsRecursively(nextState, nextRels);
  }

  getCurrentOptions(): {
    rel: string;
    options: RequestOptions;
  } {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const options = this.optionsMap.get(rel)!;
    return { rel, options };
  }
}
