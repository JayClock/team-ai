import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Links } from './links.js';
import { HalResource } from 'hal-types';
import { Resource } from './resource.js';

type StateInit = {
  uri: string;
  client: Client;
  data: HalResource;
};

export class State<TSchema extends BaseSchema = BaseSchema> {
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  private readonly links: Links<TSchema['relations']>;

  constructor(private init: StateInit) {
    const { _links, _embedded, _templates, ...prueData } = this.init.data;
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = prueData;
    this.links = this.createLinks();
  }

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Resource<TSchema['relations'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return this.client.go(link.href);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  private createLinks(): Links<TSchema['relations']> {
    const links = new Links();
    const halLinks = this.init.data._links;
    for (const [key, value] of Object.entries(halLinks ?? [])) {
      const linkList = Array.isArray(value) ? value : [value];
      links.add(linkList.map((item) => ({ ...item, rel: key })));
    }
    return links;
  }
}
