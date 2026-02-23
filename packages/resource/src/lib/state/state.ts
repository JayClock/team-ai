import { Entity } from '../archtype/entity.js';
import { StateCollection } from './state-collection.js';
import { ClientInstance } from '../client-instance.js';
import { Resource } from '../index.js';
import { Link, LinkVariables } from '../links/link.js';
import { Links } from '../links/links.js';
import { Action } from '../action/action.js';

/**
 * Represents the metadata-only state of a resource from a HEAD response.
 *
 * HEAD state contains links and content headers, but no response body.
 *
 * @typeParam TEntity - The entity type defining available links
 */
export type HeadState<TEntity extends Entity = Entity> = {
  /**
   * Timestamp of when the head state was first generated
   */
  timestamp: number;

  /**
   * The URI associated with this head state
   */
  uri: string;

  /**
   * Checks if a link with the given relation exists.
   */
  hasLink<K extends keyof TEntity['links']>(rel: K): boolean;

  /**
   * Raw links container for low-level traversal scenarios.
   */
  links: Links<TEntity['links']>;

  /**
   * Gets the raw link object for a given relation.
   */
  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined;

  /**
   * Follows a relationship to create a Resource for navigation.
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables,
  ): Resource<TEntity['links'][K]>;

  /**
   * Follows all links for the same relation.
   */
  followAll<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>[];

  /**
   * Returns content-related HTTP headers for this state.
   */
  contentHeaders(): Headers;
};

/**
 * Represents the state of a REST resource at a specific point in time.
 *
 * State is the result of fetching a resource and contains:
 * - **data**: The resource's payload/properties
 * - **collection**: Embedded collection items (for collection resources)
 * - **links**: Available navigation links to related resources
 * - **actions**: Executable forms/templates for state transitions
 *
 * State objects are immutable snapshots. Use Resource methods to modify
 * the server state and obtain new State objects.
 *
 * @typeParam TEntity - The entity type defining data shape and available links
 *
 * @example
 * ```typescript
 * const state = await client.go<User>('/users/123').get();
 *
 * // Access data
 * console.log(state.data.name);
 *
 * // Navigate via links
 * const postsResource = state.follow('posts');
 * const posts = await postsResource.get();
 *
 * // Execute actions
 * if (state.hasActionFor('edit')) {
 *   const action = state.actionFor('edit');
 *   await action.submit({ name: 'New Name' });
 * }
 * ```
 *
 * @see {@link Resource} for fetching and modifying resources
 * @see {@link Entity} for defining resource types
 * @see {@link Action} for executable forms
 *
 * @category State
 */
export type State<TEntity extends Entity = Entity> = {
  /**
   * Timestamp of when the State was first generated
   */
  timestamp: number;

  /**
   * Whether this state is partial (typically transcluded/summary data).
   *
   * Partial states should not be trusted as full detail representations.
   * Consumers may choose to force-refresh when partial cache is encountered.
   */
  isPartial: boolean;

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
   * Checks if a link with the given relation exists.
   *
   * @typeParam K - The link relation name
   * @param rel - The relation type to check for
   * @returns `true` if the link exists, `false` otherwise
   */
  hasLink<K extends keyof TEntity['links']>(rel: K): boolean;

  /**
   * Raw links container for low-level traversal scenarios.
   */
  links: Links<TEntity['links']>;

  /**
   * Gets the raw link object for a given relation.
   *
   * @typeParam K - The link relation name
   * @param rel - The relation type to retrieve
   * @returns The Link object or `undefined` if not found
   *
   * @see {@link follow} for navigating to linked resources
   */
  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined;

  /**
   * Follows a relationship to create a Resource for navigation.
   *
   * This is the primary method for HATEOAS-driven navigation.
   * The returned Resource can be used to fetch the linked resource's state.
   *
   * @typeParam K - The link relation name (e.g., 'self', 'posts', 'author')
   * @param rel - The relation type to follow
   * @param variables - Optional template variables for URI expansion
   * @returns A Resource instance for the linked resource
   *
   * @example
   * ```typescript
   * // Follow a simple link
   * const authorResource = postState.follow('author');
   * const author = await authorResource.get();
   *
   * // Follow with template variables
   * const searchResource = state.follow('search', { q: 'hello' });
   * ```
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables,
  ): Resource<TEntity['links'][K]>;

  /**
   * Follows all links for the same relation.
   */
  followAll<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>[];

  /**
   * Serializes the state for use in HTTP request bodies.
   *
   * For JSON resources, this typically returns `JSON.stringify(data)`.
   * The serialization format depends on the content type.
   *
   * @returns The serialized body as Buffer, Blob, or string
   */
  serializeBody(): Buffer | Blob | string;

  /**
   * Returns content-related HTTP headers for this state.
   *
   * These headers (e.g., Content-Type, Content-Length) describe the
   * resource content and are used when sending the state back to the server.
   *
   * @returns Headers object containing content-related headers
   */
  contentHeaders(): Headers;


  /**
   * Return an action by name.
   *
   * If no name is given, the first action is returned. This is useful for
   * formats that only supply 1 action, and no name.
   */
  /**
   * Return an action by name.
   *
   * If no name is given, the first action is returned. This is useful for
   * formats that only supply 1 action, and no name.
   */
  action<K extends keyof TEntity['links']>(
    name: K,
  ): Action<TEntity['links'][K]>;

  /**
   * Creates a deep clone of this state object.
   *
   * Useful for creating modified copies of state without affecting the original.
   *
   * @returns A new State instance with the same data
   */
  clone(): State<TEntity>;
};

/**
 * Factory for creating State objects from HTTP responses.
 *
 * StateFactory implementations handle specific content types (HAL, JSON-API, etc.)
 * and convert HTTP responses into typed State objects.
 *
 * @internal
 * @category State
 */
export type StateFactory = {
  /**
   * Creates a State object from an HTTP response.
   *
   * @typeParam TEntity - The entity type for the resulting state
   * @param client - The client instance for resource resolution
   * @param link - The link that was followed to get this response
   * @param response - The fetch Response object
   * @returns A Promise resolving to the typed State object
   */
  create: <TEntity extends Entity>(
    client: ClientInstance,
    link: Link,
    response: Response,
  ) => Promise<State<TEntity>>;
};
