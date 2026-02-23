import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Entity } from './archtype/entity.js';
import { NewLink } from './links/link.js';
import { container } from './container.js';
import { FetchMiddleware } from './http/fetcher.js';
import { Resource } from './index.js';
import type { StateFactory } from './state/state.js';

/**
 * A HATEOAS client for navigating HAL-compliant REST APIs.
 *
 * The Client provides the entry point for resource navigation and supports
 * middleware for request interception (authentication, logging, etc.).
 *
 * @example
 * ```typescript
 * import { createClient, Entity } from '@hateoas-ts/resource';
 *
 * type User = Entity<{ id: string; name: string }, { self: User }>;
 *
 * const client = createClient({ baseURL: 'https://api.example.com' });
 * const user = await client.go<User>('/users/123').get();
 * console.log(user.data.name);
 * ```
 *
 * @category Client
 */
export interface Client {
  /**
   * Navigate to a resource by path or link object.
   *
   * @typeParam TEntity - The entity type for the target resource
   * @param link - Path relative to baseURL or a NewLink object with href and templated properties
   * @returns A Resource instance for the target endpoint
   *
   * @example
   * ```typescript
   * // Navigate by path
   * const userResource = client.go<User>('/users/123');
   * const user = await userResource.get();
   *
   * // Navigate with link object (for templated URIs)
   * const resource = client.go<User>({ href: '/users/{id}', templated: true });
   * ```
   */
  go<TEntity extends Entity>(link?: string | NewLink): Resource<TEntity>;

  /**
   * Add a fetch middleware to intercept requests and responses.
   *
   * Middlewares are executed in order for each fetch() call. Use middlewares
   * for authentication, logging, error handling, or request transformation.
   *
   * @param middleware - Middleware function that receives request and next function
   * @param origin - Optional origin filter. Use '*' for all origins (default), or specify a host like 'https://api.example.com'
   *
   * @example
   * ```typescript
   * // Add authentication middleware
   * client.use(async (request, next) => {
   *   request.headers.set('Authorization', `Bearer ${token}`);
   *   return next(request);
   * });
   *
   * // Add logging middleware for specific origin
   * client.use(async (request, next) => {
   *   console.log('Request:', request.url);
   *   const response = await next(request);
   *   console.log('Response:', response.status);
   *   return response;
   * }, 'https://api.example.com');
   * ```
   */
  use(middleware: FetchMiddleware, origin?: string): void;

  /**
   * Registers or overrides a content-type parser at runtime.
   *
   * Use this to plug in parsers for media types such as JSON:API, Siren,
   * Collection+JSON, HTML, or any custom type.
   */
  registerContentType(
    mimeType: string,
    factory: StateFactory,
    quality?: string,
  ): void;
}

/**
 * Creates a new HATEOAS client instance.
 *
 * The client is the entry point for interacting with HAL-compliant REST APIs.
 * It manages resource navigation, caching, and middleware execution.
 *
 * @param options - Client configuration options
 * @returns A configured Client instance
 *
 * @example
 * ```typescript
 * import { createClient, Entity, Collection } from '@hateoas-ts/resource';
 *
 * // Define your entity types
 * type Post = Entity<{ id: string; title: string }, { self: Post; author: User }>;
 * type User = Entity<
 *   { id: string; name: string },
 *   { self: User; posts: Collection<Post> }
 * >;
 *
 * // Create client and navigate resources
 * const client = createClient({ baseURL: 'https://api.example.com' });
 * const user = await client.go<User>('/users/123').get();
 *
 * // Follow HATEOAS links - no URL hardcoding!
 * const posts = await user.follow('posts').get();
 * ```
 *
 * @category Client
 */
export const createClient = (options: Config): Client => {
  container.bind(TYPES.Config).toConstantValue(options);
  return container.get(TYPES.Client);
};
