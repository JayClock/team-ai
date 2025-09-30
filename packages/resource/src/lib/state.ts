import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Links } from './links.js';
import { HalResource } from 'hal-types';

type StateInit = {
  uri: string;
  client: Client;
  data: HalResource;
};

export class State<TSchema extends BaseSchema> {
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  readonly links: Links<TSchema['relations']>;

  constructor(private init: StateInit) {
    const { _links, _embedded, _templates, ...prueData } = this.init.data;
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = prueData;
    this.links = this.createLinks();
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
