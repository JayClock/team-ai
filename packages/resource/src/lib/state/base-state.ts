import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { Resource } from '../resource/resource.js';
import { StateResource } from '../resource/state-resource.js';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';

type StateInit<TEntity extends Entity> = {
  uri: string;
  client: ClientInstance;
  data: TEntity['data'];
  links: Links<TEntity['links']>;
  headers: Headers;
  forms?: Form[];
  collection?: StateCollection<TEntity>;
  embedded?: Record<string, State | State[]>;
};

export class BaseState<TEntity extends Entity> implements State<TEntity> {
  readonly uri: string;
  readonly client: ClientInstance;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['links']>;
  readonly timestamp = Date.now();
  readonly embedded: Record<string, State | State[]>;

  private readonly forms: Form[];

  constructor(private init: StateInit<TEntity>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.forms = init.forms ?? [];
    this.collection = init.collection ?? [];
    this.embedded = init.embedded ?? {};
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new StateResource(this.client, this, [link.rel]);
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

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel);
  }

  getEmbedded<K extends keyof TEntity['links']>(rel: K): State | State[] {
    return this.embedded[rel as string];
  }

  clone(): State<TEntity> {
    return new BaseState(this.init);
  }
}
