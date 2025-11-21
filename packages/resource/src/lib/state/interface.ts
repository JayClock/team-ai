import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { Links } from '../links.js';
import { Relation } from '../relation.js';

export type State<TEntity extends Entity = Entity> = {
  uri: string;

  data: TEntity['description'];

  client: Client;

  collection: State[];

  links: Links<TEntity['relations']>;

  follow<K extends keyof TEntity['relations']>(
    rel: K
  ): Relation<TEntity['relations'][K]>;

  getForm<K extends keyof TEntity['relations']>(
    rel: K,
    method: string
  ): Form | undefined;
};

export type Form = {
  /**
   * What url to post the form to.
   */
  uri: string;

  /**
   * Form title.
   *
   * Should be human-friendly.
   */
  title?: string;

  /**
   * The HTTP method to use
   */
  method: string;

  /**
   * The contentType to use for the form submission
   */
  contentType: string;
};
