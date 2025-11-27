import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';
import { Client } from '../client.js';
import { Resource } from './resource.js';
import { Entity } from '../archtype/entity.js';

@injectable()
export class ResourceFactory {
  constructor(
    @inject(TYPES.Client)
    private readonly client: Client
  ) {
  }

  createResource<TEntity extends Entity>(uri: string, rels: string[]): Resource<TEntity> {
    return new Resource<TEntity>(this.client, uri, rels);
  }
}
