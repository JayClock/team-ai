import { Client } from '../client.js';
import { BaseSchema } from '../base-schema.js';
import { Link, Links } from '../links.js';
import { Form, State } from './interface.js';
import { Resource } from '../resource.js';

type StateInit<TSchema extends BaseSchema> = {
  uri: string;
  client: Client;
  data: TSchema['description'];
  links: Links<TSchema['relations']>;
  collection?: State[];
  forms?: Form[];
  embedded?: Record<string, State | State[]>;
};

export class BaseState<TSchema extends BaseSchema = BaseSchema>
  implements State<TSchema>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  readonly collection: State[];
  private readonly links: Links<TSchema['relations']>;
  private readonly forms: Form[];
  private readonly embedded: Record<string, State | State[]>;

  constructor(init: StateInit<TSchema>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.collection = init.collection || [];
    this.forms = init.forms || [];
    this.embedded = init.embedded || {};
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

  getForm<K extends keyof TSchema['relations']>(rel: K, method: string) {
    const link = this.links.get(rel as string);
    if (!link) {
      return undefined;
    }
    return this.forms.find(
      (form) => form.uri === link.href && form.method === method
    );
  }

  getEmbedded(rel: string): State | State[] {
    return this.embedded[rel];
  }

  getLink(rel: string): Link | undefined {
    return this.links.get(rel);
  }
}
