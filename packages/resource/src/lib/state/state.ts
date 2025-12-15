import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { Form } from '../form/form.js';
import { StateCollection, EmbeddedStates } from './state-collection.js';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { HttpMethod } from '../http/util.js';
import { Resource } from '../index.js';

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
   * Embedded resources with types derived from TEntity['links']
   */
  embedded: Partial<EmbeddedStates<TEntity>>;

  /**
   * Follows a relationship, based on its rel type. For example, this might be
   * 'alternate', 'item', 'edit' or a custom url-based one.
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>;

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined;

  /**
   * Return a from by rel key.
   * */
  getForm<K extends keyof TEntity['links']>(
    rel: K,
    method?: HttpMethod,
  ): Form | undefined;

  /**
   * Get an embedded resource by rel key.
   */
  getEmbedded<K extends keyof TEntity['links']>(
    rel: K,
  ): EmbeddedStates<TEntity>[K] | undefined;

  /**
   * Returns a serialization of the state that can be used in a HTTP
   * response.
   *
   * For example, a JSON object might simply serialize using
   * JSON.serialize().
   */
  serializeBody(): Buffer | Blob | string;

  /**
   * Content-headers are a subset of HTTP headers that related directly
   * to the content. The obvious ones are Content-Type.
   *
   * This set of headers will be sent by the server along with a GET
   * response, but will also be sent back to the server in a PUT
   * request.
   */
  contentHeaders(): Headers;

  clone(): State<TEntity>;
};

/**
 * A 'StateFactory' is responsible for taking a Fetch Response, and returning
 * an object that implements the State interface
 */
export type StateFactory = {
  create: <TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response,
    rel?: string,
  ) => Promise<State<TEntity>>;
};
