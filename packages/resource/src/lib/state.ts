import { Client } from './client.js';
import { BaseSchema } from './base-schema.js';
import { Links } from './links.js';

type StateInit<T> = {
  uri: string;
  client: Client;
  data: T;
};

export class State<TSchema extends BaseSchema> {
  readonly uri: string;
  readonly client: Client;
  readonly data: TSchema['description'];
  readonly links: Links;

  constructor(private init: StateInit<TSchema['description']>) {
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = this.init.data;
    this.links = new Links();
  }
}
