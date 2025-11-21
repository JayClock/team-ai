import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { Links } from '../links.js';
import { Relation } from '../relation.js';
import { Form } from '../form/form.js';
import { StateCollection } from './state-collection.js';

export type State<TEntity extends Entity = Entity> = {
  uri: string;

  data: TEntity['description'];

  client: Client;

  collection: StateCollection<TEntity>;

  links: Links<TEntity['relations']>;

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): Relation<TEntity['relations'][K]>;

  getForm<K extends keyof TEntity['relations']>(
    rel: K,
    method: string
  ): Form | undefined;

  clone(): State<TEntity>;
};
