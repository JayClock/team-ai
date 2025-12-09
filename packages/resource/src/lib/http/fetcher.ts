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
}
