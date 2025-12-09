import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';
import type { Config } from '../archtype/config.js';
import { Link } from '../links/link.js';
import { RequestOptions } from '../resource/resource.js';
import { parseTemplate } from 'url-template';
import queryString from 'query-string';

@injectable()
export class Fetcher {
  constructor(@inject(TYPES.Config) private config: Config) {}

  async fetch(link: Link, option: RequestOptions = {}): Promise<Response> {
    const { body, query } = option;
    let url = `${this.config.baseURL}${link.href}`;
    if (link.templated) {
      url = parseTemplate(url).expand(query ?? {});
    } else {
      url = queryString.stringifyUrl({
        url,
        query,
      });
    }
    return await fetch(url, {
      body: JSON.stringify(body),
      method: link.type,
    });
  }
}
