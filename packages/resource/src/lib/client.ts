import { Entity } from './archtype/entity.js';
import { SafeAny } from './archtype/safe-any.js';
import { Resource } from './resource.js';

export interface ClientOptions {
  baseURL: string;
}

export class Client {
  private resources = new Map<string, Resource<SafeAny>>();

  constructor(private options: ClientOptions) {}

  root<TEntity extends Entity>(uri: string): Resource<TEntity> {
    const resource = new Resource<TEntity>(this, uri);
    if (this.resources.has(uri)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.resources.get(uri)!;
    }
    this.resources.set(uri, resource);
    return resource;
  }

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(`${this.options.baseURL}${input}`, init);
  }
}
