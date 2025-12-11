import { injectable } from 'inversify';
import { Link } from '../links/link.js';
import { RequestOptions } from '../resource/resource.js';
import { parseTemplate } from 'url-template';
import queryString from 'query-string';
import problemFactory from './error.js';
import { resolve } from '../util/uri.js';

@injectable()
export class Fetcher {
  /**
   * A wrapper for MDN fetch()
   */
  private async fetch(
    link: Link,
    options: RequestOptions = {}
  ): Promise<Response> {
    const { body, query, method } = options;
    let path: string;
    if (link.templated) {
      path = parseTemplate(link.href).expand(query ?? {});
    } else {
      path = queryString.stringifyUrl({
        url: link.href,
        query,
      });
    }

    return await fetch(resolve(link.context, path), {
      body: JSON.stringify(body),
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
    options: RequestOptions = {}
  ): Promise<Response> {
    const response = await this.fetch(link, options);

    if (response.ok) {
      return response;
    } else {
      throw await problemFactory(response);
    }
  }
}
