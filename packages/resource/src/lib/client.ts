import { Entity } from './archtype/entity.js';
import { Resource } from './resource/resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import type { Config } from './archtype/config.js';
import { ResourceFactory } from './resource/resource-factory.js';

@injectable()
export class Client {
  constructor(
    @inject(TYPES.Config)
    private options: Config,
    @inject(TYPES.ResourceFactory)
    private readonly resourceFactory: ResourceFactory
  ) {}

  go<TEntity extends Entity>(uri: string): Resource<TEntity> {
    return this.resourceFactory.createResource<TEntity>(uri, []);
  }

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(`${this.options.baseURL}${input}`, init);
  }
}
