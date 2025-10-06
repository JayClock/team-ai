import { BaseSchema } from '../base-schema.js';
import { Client } from '../client.js';
import { Resource } from '../resource.js';

export type State<TSchema extends BaseSchema = BaseSchema> = {
  uri: string;

  data: TSchema['description'];

  client: Client;

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Resource<TSchema['relations'][K]>;

  hasLink<K extends keyof TSchema['relations']>(rel: K): boolean;
};
