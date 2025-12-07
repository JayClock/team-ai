import { Entity } from '../archtype/entity.js';
import { ResourceState } from '../state/resource-state.js';
import { RequestOptions, Resource } from './resource.js';
import { State } from '../state/state.js';
import { HalState } from '../state/hal-state.js';
import { Client } from '../client.js';

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
      this.rels.concat(rel as string)
    );
  }

  async request(): Promise<ResourceState<TEntity>> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const link = this.state.links.get(this.rels[0])!;
    const embedded = (this.state as HalState).getEmbedded(link.rel);
    if (Array.isArray(embedded)) {
      return HalState.create(
        this.client,
        link.href,
        {
          _embedded: {
            [link.rel]: embedded,
          },
        },
        link.rel
      ) as unknown as ResourceState<TEntity>;
    }
    return HalState.create(this.client, link.href, embedded);
  }

  withRequestOptions(options: RequestOptions): Resource<TEntity> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRel = this.rels.at(-1)!;
    this.optionsMap.set(lastRel, options);
    return this;
  }
}
