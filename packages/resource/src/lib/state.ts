import { Client } from './client.js';

type StateInit<T> = {
  uri: string;
  client: Client;
  data: T;
};

export class State<T = any> {
  readonly uri: string;
  readonly client: Client;
  readonly data: T;

  constructor(private init: StateInit<T>) {
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = this.init.data;
  }
}
