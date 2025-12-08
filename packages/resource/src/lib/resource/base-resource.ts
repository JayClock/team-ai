import { Link } from '../links.js';
import { parseTemplate } from 'url-template';
import { HalState } from '../state/hal-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { HalResource } from 'hal-types';
import { RequestOptions } from './resource.js';
import { Axios } from 'axios';

export class BaseResource {
  constructor(
    protected readonly axios: Axios,
    protected readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

  protected async httpRequest(link: Link) {
    const context = this.getRequestOption(link);
    const url = parseTemplate(link.href).expand(context.query ?? {});

    const response = await this.axios.request({
      url: url,
      method: link.type,
      data: context.body,
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
