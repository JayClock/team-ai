import { Entity } from '../archtype/entity.js';
import { ResourceState } from '../state/resource-state.js';
import { RequestOptions, Resource } from './resource.js';
import { State } from '../state/state.js';
import { HalState } from '../state/hal-state.js';
import { Client } from '../client.js';
import { SafeAny } from '../archtype/safe-any.js';
import { BaseResource } from './base-resource.js';

export class StateResource<TEntity extends Entity>
  extends BaseResource
  implements Resource<TEntity>
{
  constructor(
    client: Client,
    private state: State,
    private rels: string[] = [],
    optionsMap: Map<string, RequestOptions> = new Map()
  ) {
    super(client, optionsMap);
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    return new StateResource(
      this.client,
      this.state,
      this.rels.concat(rel as string),
      this.optionsMap
    );
  }

  async request(): Promise<ResourceState<TEntity>> {
    if (this.rels.length === 0) {
      throw new Error('No relations to follow');
    }

    const result = await this.resolveRelationsRecursively(
      this.state,
      this.rels
    );
    return result as unknown as ResourceState<TEntity>;
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

    const embedded = (currentState as HalState).getEmbedded(link.rel);
    let nextState: State<SafeAny>;

    if (Array.isArray(embedded)) {
      nextState = HalState.create(
        this.client,
        link.href,
        {
          _embedded: {
            [link.rel]: embedded,
          },
        },
        link.rel
      ) as unknown as State<any>;
    } else if (embedded) {
      nextState = HalState.create(this.client, link.href, embedded);
    } else {
      // If no embedded data is available, make an HTTP request
      nextState = await this.httpRequest(link);
    }

    return this.resolveRelationsRecursively(nextState, nextRels);
  }

  withRequestOptions(options: RequestOptions): Resource<TEntity> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.rels.at(-1)!;
    this.optionsMap.set(lastRel, options);
    return this;
  }
}
