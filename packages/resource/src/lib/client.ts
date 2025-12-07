import { Entity } from './archtype/entity.js';
import { LinkResource } from './resource/link-resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import type { Config } from './archtype/config.js';
import { Fetcher } from './http/fetcher.js';
import { Link } from './links.js';
import { Resource } from './resource/resource.js';

@injectable()
export class Client {
  constructor(
    @inject(TYPES.Config)
    private options: Config,
    @inject(TYPES.Fetcher)
    private readonly fetcher: Fetcher
  ) {}

  go<TEntity extends Entity>(link: Link): Resource<TEntity> {
    return new LinkResource<TEntity>(this, link);
  }

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return this.fetcher.fetch(`${this.options.baseURL}${input}`, init);
  }
}
