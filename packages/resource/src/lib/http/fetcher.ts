import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';
import type { Config } from '../archtype/config.js';
import { Link } from '../links/link.js';
import { RequestOptions } from '../resource/resource.js';
import { parseTemplate } from 'url-template';
import queryString from 'query-string';
import problemFactory from './error.js';

@injectable()
export class Fetcher {
  constructor(@inject(TYPES.Config) private config: Config) {}

  /**
   * A wrapper for MDN fetch()
   */
  private async fetch(
    link: Link,
    options: RequestOptions = {}
  ): Promise<Response> {
    const { body, query } = options;
    let path: string;
    if (link.templated) {
      path = parseTemplate(link.href).expand(query ?? {});
    } else {
      path = queryString.stringifyUrl({
        url: link.href,
        query,
      });
    }
    return await fetch(new URL(path, this.config.baseURL), {
      body: JSON.stringify(body),
      method: link.type,
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
