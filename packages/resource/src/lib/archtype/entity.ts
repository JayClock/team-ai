import { SafeAny } from './safe-any.js';

/**
 * Defines the shape of a HAL resource entity with typed data and links.
 *
 * Entity is the core type definition for resources in a HATEOAS API. It combines:
 * - **data**: The resource's payload/properties
 * - **links**: Available navigation links to related resources (includes action links)
 *
 * Actions are discovered through link relations using `state.actionFor(rel)`.
 * Links that have associated HAL-Forms templates can be used as actions.
 *
 * @typeParam TData - The data payload type (resource properties)
 * @typeParam TLinks - Record mapping link relation names to their target entity types
 *
 * @example
 * ```typescript
 * import { Entity, Collection } from '@hateoas-ts/resource';
 *
 * // Simple entity with self link
 * type Post = Entity<
 *   { id: string; title: string; content: string },
 *   { self: Post; author: User }
 * >;
 *
 * // Entity with collection links and action links
 * type User = Entity<
 *   { id: string; name: string; email: string },
 *   {
 *     self: User;
 *     posts: Collection<Post>;
 *     'create-post': Post;  // Action link (has HAL-Forms template)
 *   }
 * >;
 *
 * // Usage
 * const user = await client.go<User>('/users/123').get();
 * console.log(user.data.name);  // Type-safe access to data
 * const posts = await user.follow('posts').get();  // Type-safe link navigation
 *
 * // Execute action through link relation
 * if (user.hasActionFor('create-post')) {
 *   const action = user.actionFor('create-post');
 *   await action.submit({ title: 'New Post' });
 * }
 * ```
 *
 * @category Entity Types
 */
export interface Entity<
  TData extends SafeAny = SafeAny,
  TLinks extends Record<string, Entity> = Record<string, SafeAny>,
> {
  /** The resource's data payload containing its properties */
  data: TData;
  /** Available link relations to other resources (HATEOAS navigation and actions) */
  links: TLinks;
}
