import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { Form } from '../form/form.js';
import { StateCollection } from './state-collection.js';
import { Resource } from '../resource/resource.js';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';

export type State<TEntity extends Entity = Entity> = {
  /**
   * Timestamp of when the State was first generated
   */
  timestamp: number;

  /**
   * The URI associated with this state
   */
  uri: string;

  /**
   * Represents the body of the HTTP response.
   *
   * In the case of a JSON response, this will be deserialized
   */
  data: TEntity['data'];

  /**
   * Represents the collection state of the resource
   *
   * Contains an array of State objects for each element in the collection when the entity is a collection type
   * Returns an empty array when the entity is not a collection type
   * Supports navigation and state management for paginated collections
   */
  collection: StateCollection<TEntity>;

  /**
   * All links associated with the resource.
   */
  links: Links<TEntity['links']>;

  /**
   * Follows a relationship, based on its rel type. For example, this might be
   * 'alternate', 'item', 'edit' or a custom url-based one.
   */
  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]>;

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined;

  /**
   * Return a from by rel key.
   * */
  getForm<K extends keyof TEntity['links']>(rel: K): Form | undefined;

  clone(): State<TEntity>;
};

/**
 * HeadState represents the response to a HEAD request.
 *
 * Some information in HEAD responses might be available, but many aren't.
 * Notably, the body.
 */
export type HeadState = Omit<State, 'data' | 'clone' | 'collection'>;

/**
 * A 'StateFactory' is responsible for taking a Fetch Response, and returning
 * an object that implements the State interface
 */
export type StateFactory = {
  create: <TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response,
    rel?: string
  ) => Promise<State<TEntity>>;
};
