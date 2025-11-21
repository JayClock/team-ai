import { Client } from '../client.js';
import { Entity } from '../archtype/entity.js';
import { Link, Links } from '../links.js';
import { Form, State, StateCollection } from './interface.js';
import { Relation } from '../relation.js';

type StateInit<TEntity extends Entity> = {
  uri: string;
  client: Client;
  data: TEntity['description'];
  links: Links<TEntity['relations']>;
  collection?: State[];
  forms?: Form[];
  embedded?: Record<string, State | State[]>;
};

export class HalState<TEntity extends Entity = Entity>
  implements State<TEntity>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TEntity['description'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['relations']>;
  private readonly forms: Form[];
  private readonly embedded: Record<string, State | State[]>;

  constructor(init: StateInit<TEntity>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.collection = (init.collection || []) as StateCollection<TEntity>;
    this.forms = init.forms || [];
    this.embedded = init.embedded || {};
  }

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): Relation<TEntity['relations'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new Relation(this.client, this.uri, [rel as string]);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  getForm<K extends keyof TEntity['relations']>(rel: K, method: string) {
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
