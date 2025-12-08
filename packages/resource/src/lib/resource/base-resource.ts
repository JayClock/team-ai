import { Link } from '../links.js';
import { parseTemplate } from 'url-template';
import { HalState } from '../state/hal-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { HalResource } from 'hal-types';
import { RequestOptions } from './resource.js';
import { Axios } from 'axios';
import queryString from 'query-string';

export class BaseResource {
  constructor(
    protected readonly axios: Axios,
    protected readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

  protected async httpRequest(link: Link) {
    const { query, body } = this.getRequestOption(link);
    let url;
    if (link.templated) {
      url = parseTemplate(link.href).expand(query ?? {});
    } else {
      url = queryString.stringifyUrl({
        url: link.href,
        query,
      });
    }

    const response = await this.axios.request({
      url: url,
      method: link.type,
      data: body,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return HalState.create<SafeAny>(
      this.axios,
      url,
      (await response.data) as HalResource,
      link.rel
    );
  }

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }
}
