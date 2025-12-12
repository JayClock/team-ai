import { injectable } from 'inversify';
import { Link } from '../links/link.js';
import { ResourceOptions } from '../resource/resource.js';
import problemFactory from './error.js';
import { expand } from '../util/uri-template.js';

@injectable()
export class Fetcher {
  /**
   * A wrapper for MDN fetch()
   */
  private async fetch(
    link: Link,
    options: ResourceOptions = {}
  ): Promise<Response> {
    const { data, query, method } = options;
    const url = expand(link, query);

    return await fetch(url, {
      body: JSON.stringify(data),
      method: method || 'GET',
      headers: {
        'Content-Type': link.type ?? 'application/json',
      },
    });
  }

  /**
   * Does a HTTP request and throws an exception if the server emitted
   * a HTTP error.
   */
  async fetchOrThrow(
    link: Link,
    options: ResourceOptions = {}
  ): Promise<Response> {
    const response = await this.fetch(link, options);

    if (response.ok) {
      return response;
    } else {
      throw await problemFactory(response);
    }
  }
}
