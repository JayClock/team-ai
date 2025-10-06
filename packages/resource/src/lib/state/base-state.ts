import { Client } from '../client.js';
import { BaseSchema } from '../base-schema.js';
import { Links } from '../links.js';
import { Relation } from '../relation.js';
import { State } from './interface.js';

type StateInit<TSchema extends BaseSchema> = {
  uri: string;
  client: Client;
  data: TSchema['description'];
  links: Links<TSchema['relations']>;
};

export class BaseState<TSchema extends BaseSchema = BaseSchema>
  implements State<TSchema>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  private readonly links: Links<TSchema['relations']>;

  constructor(init: StateInit<TSchema>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
  }

  hasLink<K extends keyof TSchema['relations']>(rel: K): boolean {
    return !!this.links.get(rel as string);
  }

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]> {
    if (this.hasLink(rel)) {
      const link = this.links.get(rel as string);
      return new Relation(this.client, this.uri, [link!.rel]);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }
}
