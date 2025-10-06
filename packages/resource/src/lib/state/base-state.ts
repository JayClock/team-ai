import { Client } from '../client.js';
import { BaseSchema } from '../base-schema.js';
import { Links } from '../links.js';
import { State } from './interface.js';
import { Resource } from '../resource.js';

type StateInit<TSchema extends BaseSchema> = {
  uri: string;
  client: Client;
  data: TSchema['description'];
  links: Links<TSchema['relations']>;
  collection?: State[];
};

export class BaseState<TSchema extends BaseSchema = BaseSchema>
  implements State<TSchema>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  readonly collection: State[];
  private readonly links: Links<TSchema['relations']>;

  constructor(init: StateInit<TSchema>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.collection = init.collection || [];
  }

  hasLink<K extends keyof TSchema['relations']>(rel: K): boolean {
    return !!this.links.get(rel as string);
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
}
