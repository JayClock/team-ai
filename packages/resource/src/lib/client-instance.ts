import { Entity } from './archtype/entity.js';
import { LinkResource } from './resource/link-resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Resource } from './resource/resource.js';
import { Client } from './create-client.js';
import { Link } from './links/link.js';
import { Fetcher } from './http/fetcher.js';
import { State } from './state/state.js';
import { halStateFactory } from './state/hal-state/hal-state.factory.js';

@injectable()
export class ClientInstance implements Client {
  constructor(
    @inject(TYPES.Fetcher)
    readonly fetcher: Fetcher
  ) {}

  /**
   * Transforms a fetch Response to a State object.
   */

  go<TEntity extends Entity>(link: Link): Resource<TEntity> {
    return new LinkResource<TEntity>(this, link);
  }

  async getStateForResponse(
    uri: string,
    response: Response,
    rel?: string
  ): Promise<State> {
    return halStateFactory.create(this, uri, response, rel);
  }
}
