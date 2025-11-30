import { Client } from '../client.js';
import { Entity } from '../archtype/entity.js';
import { Link, Links, LinkVariables } from '../links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { Resource } from '../resource/resource.js';

type StateInit<TEntity extends Entity> = {
  uri: string;
  client: Client;
  data: TEntity['data'];
  links: Links<TEntity['links']>;
  collection?: State[];
  forms?: Form[];
  embedded?: Record<string, State | State[]>;
};

export class HalState<TEntity extends Entity = Entity>
  implements State<TEntity>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['links']>;
  private readonly forms: Form[];
  private readonly embedded: Record<string, State | State[]>;

  constructor(private init: StateInit<TEntity>) {
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = this.init.data;
    this.links = this.init.links;
    this.collection = (this.init.collection || []) as StateCollection<TEntity>;
    this.forms = this.init.forms || [];
    this.embedded = this.init.embedded || {};
  }

  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables: LinkVariables = {}
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new Resource(
        this.client,
        this.uri,
        [rel as string],
        new Map([[rel as string, variables]])
      );
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  getForm<K extends keyof TEntity['links']>(rel: K) {
    const link = this.links.get(rel as string);
    if (!link) {
      return undefined;
    }
    return this.forms.find(
      (form) => form.uri === link.href && form.method === link.type
    );
  }

  getEmbedded(rel: string): State | State[] {
    return this.embedded[rel];
  }

  getLink(rel: string): Link | undefined {
    return this.links.get(rel);
  }

  clone(): State<TEntity> {
    return new HalState(this.init);
  }
}
