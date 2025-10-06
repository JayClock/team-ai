import { BaseSchema } from '../base-schema.js';
import { Client } from '../client.js';
import { Links } from '../links.js';
import { Relation } from '../relation.js';

export type State<TSchema extends BaseSchema = BaseSchema> = {
  uri: string;

  data: TSchema['description'];

  client: Client;

  collection: State[];

  links: Links<TSchema['relations']>;

  follow<K extends keyof TSchema['relations']>(
    rel: K
  ): Relation<TSchema['relations'][K]>;

  getForm<K extends keyof TSchema['relations']>(
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
