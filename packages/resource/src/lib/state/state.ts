import { Entity } from '../archtype/entity.js';
import { StateCollection } from './state-collection.js';
import { ClientInstance } from '../client-instance.js';
import { Resource } from '../index.js';
import { Link, LinkVariables } from '../links/link.js';
import { Action } from '../action/action.js';
import { HttpMethod } from '../http/util.js';

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
   * Checks if an action exists for the specified link relation.
   *
   * An action is a HAL-Forms template that enables state transitions.
   * This method matches forms where `form.uri === link.href`.
   *
   * @typeParam K - The link relation name
   * @param rel - The link relation name
   * @param method - Optional HTTP method to filter by (e.g., 'POST', 'PUT', 'DELETE')
   * @returns `true` if a matching action exists, `false` otherwise
   *
   * @example
   * ```typescript
   * if (state.hasActionFor('edit')) {
   *   // Show edit button
   * }
   *
   * if (state.hasActionFor('item', 'DELETE')) {
   *   // Show delete button
   * }
   * ```
   */
  hasActionFor<K extends keyof TEntity['links']>(
    rel: K,
    method?: HttpMethod,
  ): boolean;

  /**
   * Returns an action associated with the specified link relation.
   *
   * Matches forms where form.uri === link.href.
   * If method is specified, also matches form.method === method.
   *
   * This follows HATEOAS principles by discovering actions through link relations
   * rather than requiring clients to know template keys in advance.
   *
   * @param rel - The link relation name
   * @param method - Optional HTTP method to filter by (e.g., 'POST', 'PUT', 'DELETE')
   * @throws ActionNotFound - When link doesn't exist or no matching form is found
   * @throws AmbiguousActionError - When multiple forms match and no method is specified
   *
   * @example
   * ```typescript
   * // Discover action through link relation
   * if (state.hasActionFor('create-conversation')) {
   *   const action = state.actionFor('create-conversation');
   *   await action.submit({ title: 'New Chat' });
   * }
   *
   * // Disambiguate when multiple methods exist for same URL
   * const updateAction = state.actionFor('item', 'PUT');
   * const deleteAction = state.actionFor('item', 'DELETE');
   * ```
   */
  actionFor<K extends keyof TEntity['links']>(
    rel: K,
    method?: HttpMethod,
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
   * @param prevLink - Optional previous link for context
   * @returns A Promise resolving to the typed State object
   */
  create: <TEntity extends Entity>(
    client: ClientInstance,
    link: Link,
    response: Response,
    prevLink?: Link,
  ) => Promise<State<TEntity>>;
};
