import { BaseSchema } from './base-schema.js';
import { Resource } from './resource.js';

export interface ClientOptions {
  baseURL: string;
}

export class Client {
  private resources = new Map<string, Resource<any>>();

  constructor(private options: ClientOptions) {}

  root<TSchema extends BaseSchema>(uri: string): Resource<TSchema> {
    const resource = new Resource<TSchema>(this, uri);
    if (this.resources.has(uri)) {
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
