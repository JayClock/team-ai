import { Entity } from './archtype/entity.js';
import { LinkResource } from './resource/link-resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Resource } from './resource/resource.js';
import { Client } from './create-client.js';
import { Link } from './links/link.js';
import { Fetcher } from './http/fetcher.js';

@injectable()
export class ClientInstance implements Client {
  constructor(
    @inject(TYPES.Fetcher)
    readonly fetcher: Fetcher
  ) {}

  go<TEntity extends Entity>(link: Link): Resource<TEntity> {
    return new LinkResource<TEntity>(this, link);
  }
}
