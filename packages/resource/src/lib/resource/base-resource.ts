import { Link } from '../links.js';
import { parseTemplate } from 'url-template';
import { HalState } from '../state/hal-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { HalResource } from 'hal-types';
import { Client } from '../client.js';
import { RequestOptions } from './resource.js';

export class BaseResource {
  constructor(
    protected readonly client: Client,
    protected readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

  protected async httpRequest(link: Link) {
    const context = this.getRequestOption(link);
    const uri = parseTemplate(link.href).expand(context.query ?? {});
    const response = await this.client.fetch(uri, {
      method: link.type,
      body: JSON.stringify(context.body),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return HalState.create<SafeAny>(
      this.client,
      uri,
      (await response.json()) as HalResource,
      link.rel
    );
  }

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }
}
