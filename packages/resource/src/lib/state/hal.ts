import { BaseSchema } from '../base-schema.js';
import { BaseState } from './base-state.js';
import { Client } from '../client.js';
import { HalResource } from 'hal-types';
import { Links } from '../links.js';

export class HalState<
  TSchema extends BaseSchema = BaseSchema
> extends BaseState<TSchema> {
  constructor(client: Client, uri: string, halResource: HalResource) {
    const { _links, _embedded, _templates, ...prueData } = halResource;
    super({
      client,
      uri,
      data: prueData,
      links: createLinks(_links),
    });
  }
}

function createLinks<TLinks extends Record<string, any>>(halLinks: HalResource['_links']): Links<TLinks> {
  const links = new Links<TLinks>();
  for (const [key, value] of Object.entries(halLinks ?? [])) {
    const linkList = Array.isArray(value) ? value : [value];
    links.add(linkList.map((item) => ({ ...item, rel: key })));
  }
  return links;
}
