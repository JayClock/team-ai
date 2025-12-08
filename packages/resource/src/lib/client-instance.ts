import { Entity } from './archtype/entity.js';
import { LinkResource } from './resource/link-resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import type { Config } from './archtype/config.js';
import { Link } from './links.js';
import { Resource } from './resource/resource.js';
import axios from 'axios';
import { Client } from './create-client.js';

@injectable()
export class ClientInstance implements Client {
  constructor(
    @inject(TYPES.Config)
    private options: Config
  ) {}

  go<TEntity extends Entity>(link: Link): Resource<TEntity> {
    const instance = axios.create({ baseURL: this.options.baseURL });
    return new LinkResource<TEntity>(instance, link);
  }
}
