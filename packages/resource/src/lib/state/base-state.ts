import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { Resource } from '../resource/resource.js';
import { StateResource } from '../resource/state-resource.js';
import { Link, LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { entityHeaderNames } from '../http/util.js';
import { SafeAny } from '../archtype/safe-any.js';

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
  private readonly headers: Headers;

  constructor(protected init: StateInit<TEntity>) {
    this.uri = init.uri;
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.headers = init.headers;
    this.forms = init.forms ?? [];
    this.collection = init.collection ?? [];
    this.embedded = init.embedded ?? {};
  }

  serializeBody(): Buffer | Blob | string {
    const data = this.data as SafeAny;
    if (
      ((global as SafeAny).Buffer && data instanceof Buffer) ||
      ((global as SafeAny).Blob && data instanceof Blob) ||
      typeof data === 'string'
    ) {
      return this.data;
    }
    return JSON.stringify(data);
  }

  contentHeaders(): Headers {
    const result: { [name: string]: string } = {};
    for (const contentHeader of entityHeaderNames) {
      if (this.headers.has(contentHeader)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result[contentHeader] = this.headers.get(contentHeader)!;
      }
    }
    return new Headers(result);
  }

  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new StateResource(this.client, this).follow(link.rel, variables);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  getForm<K extends keyof TEntity['links']>(rel: K, method = 'GET') {
    const link = this.links.get(rel as string);
    if (!link) {
      return undefined;
    }
    return this.forms.find(
      (form) => form.uri === link.href && form.method === method
    );
  }

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel as string);
  }

  getEmbedded<K extends keyof TEntity['links']>(rel: K): State | State[] {
    return this.embedded[rel as string];
  }

  clone(): State<TEntity> {
    return new BaseState(this.init);
  }
}
