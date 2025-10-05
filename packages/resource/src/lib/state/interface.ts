import { BaseSchema } from '../base-schema.js';
import { Client } from '../client.js';
import { Relation } from '../relation.js';

export type State<TSchema extends BaseSchema = BaseSchema> = {
  uri: string;

  data: TSchema['description'];

  client: Client;

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]>;
};
