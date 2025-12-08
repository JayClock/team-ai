import { Entity } from '../archtype/entity.js';
import { ResourceState } from '../state/resource-state.js';
import { RequestOptions, Resource } from './resource.js';
import { State } from '../state/state.js';
import { HalState } from '../state/hal-state.js';
import { Client } from '../client.js';
import { parseTemplate } from 'url-template';
import { Link } from '../links.js';
import { HalResource } from 'hal-types';
import { SafeAny } from '../archtype/safe-any.js';

export class StateResource<TEntity extends Entity>
  implements Resource<TEntity>
{
  constructor(
    private readonly client: Client,
    private readonly state: State,
    private readonly rels: string[] = [],
    private readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

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
      const context = this.getRequestOption(link);
      const uri = parseTemplate(link.href).expand(context.query ?? {});
      const response = await this.client.fetch(uri, {
        method: link.type,
        body: JSON.stringify(context.body),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      nextState = HalState.create<SafeAny>(
        this.client,
        uri,
        (await response.json()) as HalResource,
        link.rel
      );
    }

    return this.resolveRelationsRecursively(nextState, nextRels);
  }

  withRequestOptions(options: RequestOptions): Resource<TEntity> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.rels.at(-1)!;
    this.optionsMap.set(lastRel, options);
    return this;
  }

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }
}
