import { BaseSchema } from '../base-schema.js';
import { Client } from '../client.js';
import { Resource } from '../resource.js';
import { Links } from '../links.js';

export type State<TSchema extends BaseSchema = BaseSchema> = {
  uri: string;

  data: TSchema['description'];

  client: Client;

  collection: State[];

  links: Links<TSchema['relations']>;

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Resource<TSchema['relations'][K]>;

  hasLink<K extends keyof TSchema['relations']>(rel: K): boolean;
};
