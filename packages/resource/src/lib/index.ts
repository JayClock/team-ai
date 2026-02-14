/**
 * @hateoas-ts/resource - A type-safe HATEOAS client for HAL-compliant REST APIs.
 *
 * This library provides:
 * - **Type-safe navigation**: Follow HATEOAS links with full TypeScript support
 * - **Automatic caching**: Intelligent state caching with invalidation
 * - **Middleware support**: Intercept requests for auth, logging, etc.
 * - **HAL-Forms actions**: Execute hypermedia-driven state transitions
 *
 * @example Basic usage
 * ```typescript
 * import { createClient, Entity, Collection } from '@hateoas-ts/resource';
 *
 * // Define entity types
 * type User = Entity<
 *   { id: string; name: string },
 *   { self: User; posts: Collection<Post> }
 * >;
 *
 * // Create client and navigate
 * const client = createClient({ baseURL: 'https://api.example.com' });
 * const user = await client.go<User>('/users/123').get();
 *
 * // Follow HATEOAS links
 * const posts = await user.follow('posts').get();
 * ```
 *
 * @packageDocumentation
 */
export * from './create-client.js';
export * from './archtype/entity.js';
export * from './archtype/collection.js';
export * from './resource/interface.js';
export type { State } from './state/state.js';
export type { ExtractCollectionElement } from './state/state-collection.js';
export * from './resource/resource.js';
export * from './resource/resource-relation.js';
export type { FetchMiddleware } from './http/fetcher.js';
export {
  defaultSchemaPlugin,
  standardActionSchemaPlugin,
  ActionValidationError,
} from './action/action.js';
export type {
  Action,
  ActionFormSchema,
  SchemaPlugin,
  ActionSchemaPlugin,
} from './action/action.js';
