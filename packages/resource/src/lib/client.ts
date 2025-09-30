import { BaseSchema } from './base-schema.js';
import { Resource } from './resource.js';

export interface ClientOptions {
  baseURL: string;
}

export class Client {
  constructor(private options: ClientOptions) {}

  go<TSchema extends BaseSchema>(uri: string): Resource<TSchema> {
    return new Resource<TSchema>(this, `${this.options.baseURL}/${uri}`);
  }

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(input, init);
  }
}
