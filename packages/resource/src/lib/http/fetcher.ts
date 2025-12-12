import { injectable } from 'inversify';
import { Link } from '../links/link.js';
import { ResourceOptions } from '../resource/resource.js';
import problemFactory from './error.js';
import { expand } from '../util/uri-template.js';

@injectable()
export class Fetcher {
  /**
   * A wrapper for MDN fetch()
   *
   * This wrapper supports 'fetch middlewares'. It will call them
   * in sequence.
   */
  fetch(resource: string | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(resource, init);
    return fetch(request);
  }

  /**
   * Does a HTTP request and throws an exception if the server emitted
   * a HTTP error.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/Request
   */
  async fetchOrThrow(
    resource: string | Request,
    init?: RequestInit
  ): Promise<Response> {
    const response = await this.fetch(resource, init);

    if (response.ok) {
      return response;
    } else {
      throw await problemFactory(response);
    }
  }

  private async _fetch(
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
  async _fetchOrThrow(
    link: Link,
    options: ResourceOptions = {}
  ): Promise<Response> {
    const response = await this._fetch(link, options);

    if (response.ok) {
      return response;
    } else {
      throw await problemFactory(response);
    }
  }
}
