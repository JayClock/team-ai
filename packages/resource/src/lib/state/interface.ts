import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { Links } from '../links.js';
import { Relation } from '../relation.js';
import { Collection } from '../archtype/collection.js';

type ExtractCollectionElement<T> = T extends Collection<infer U> ? U : never;

type IsCollectionType<T> = ExtractCollectionElement<T> extends never
  ? false
  : true;

export type StateCollection<TEntity extends Entity> =
  IsCollectionType<TEntity> extends true
    ? State<ExtractCollectionElement<TEntity>>[]
    : State[];

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

export type ResourceState<TEntity extends Entity = Entity> = Omit<
  State<TEntity>,
  'data' | 'collection' | 'links' | 'follow' | 'getForm'
> &
  (keyof TEntity['description'] extends never
    ? unknown
    : { data: TEntity['description'] }) &
  (IsCollectionType<TEntity> extends true
    ? { collection: StateCollection<TEntity> }
    : unknown) &
  (keyof TEntity['relations'] extends never
    ? unknown
    : Pick<State<TEntity>, 'links' | 'follow' | 'getForm'>);

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
