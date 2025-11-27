import { Entity } from './archtype/entity.js';
import { Resource } from './resource/resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import type { Config } from './archtype/config.js';

@injectable()
export class Client {
  constructor(
    @inject(TYPES.Config)
    private options: Config
  ) {}

  go<TEntity extends Entity>(uri: string): Resource<TEntity> {
    return new Resource<TEntity>(this, uri);
  }

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(`${this.options.baseURL}${input}`, init);
  }
}
