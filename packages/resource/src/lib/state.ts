import { Client } from './client.js';
import { BaseSchema, Collection } from './base-schema.js';
import { Links } from './links.js';
import { HalFormsTemplate, HalLink, HalResource } from 'hal-types';
import { Resource } from './resource.js';

type StateInit = {
  uri: string;
  client: Client;
  data: HalResource;
};

type EmbeddedStateType<
  T extends BaseSchema,
  K extends keyof T['relations']
> = T['relations'][K] extends Collection<infer U extends BaseSchema>
  ? State<U>[]
  : T['relations'][K] extends BaseSchema
  ? State<T['relations'][K]>
  : never;

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

  getEmbedded<K extends keyof TSchema['relations']>(
    rel: K
  ): EmbeddedStateType<TSchema, K> | undefined {
    const { _embedded } = this.init.data;
    if (!_embedded) {
      return undefined;
    }
    const embeddedData = _embedded[rel as string];
    if (!embeddedData) {
      return undefined;
    }
    if (Array.isArray(embeddedData)) {
      return embeddedData.map(
        (data) =>
          new State({
            client: this.client,
            uri: (data._links!.self as HalLink).href,
            data: data,
          })
      ) as EmbeddedStateType<TSchema, K>;
    } else {
      return new State({
        client: this.client,
        uri: this.links.get(rel as string)!.href,
        data: embeddedData,
      }) as EmbeddedStateType<TSchema, K>;
    }
  }

  getTemplate<K extends keyof TSchema['relations']>(
    rel: K,
    method: string
  ): HalFormsTemplate | void {
    const link = this.links.get(rel as string);
    const { _templates } = this.init.data;
    if (!link || !_templates) {
      return;
    }

    if (rel === 'self' && _templates.default.method === method) {
      return _templates.default;
    }

    for (const template of Object.values(_templates)) {
      if (template.target === link.href && template.method === method) {
        return template;
      }
    }
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
