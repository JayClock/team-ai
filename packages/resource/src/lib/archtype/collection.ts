import { Entity } from './entity.js';

/**
 * Represents a paginated collection of resources in HAL format.
 *
 * Collection is a specialized Entity type for paginated lists. It includes:
 * - **page**: Pagination metadata (size, totalElements, totalPages, number)
 * - **navigation links**: first, prev, self, next, last for page traversal
 *
 * The collection items are accessible via `state.collection` after fetching.
 *
 * @typeParam TEntity - The entity type of items in this collection
 *
 * @example
 * ```typescript
 * import { Entity, Collection } from '@hateoas-ts/resource';
 *
 * type Post = Entity<
 *   { id: string; title: string },
 *   { self: Post; author: User }
 * >;
 *
 * type User = Entity<
 *   { id: string; name: string },
 *   { self: User; posts: Collection<Post> }
 * >;
 *
 * // Fetch a collection
 * const user = await client.go<User>('/users/123').get();
 * const postsState = await user.follow('posts').get();
 *
 * // Access pagination metadata
 * console.log(`Page ${postsState.data.page.number} of ${postsState.data.page.totalPages}`);
 * console.log(`Total items: ${postsState.data.page.totalElements}`);
 *
 * // Iterate collection items
 * for (const postState of postsState.collection) {
 *   console.log(postState.data.title);
 * }
 *
 * // Navigate to next page
 * const nextPage = await postsState.follow('next').get();
 * ```
 *
 * @category Entity Types
 */
export type Collection<TEntity extends Entity> = Entity<
  {
    /** Pagination metadata */
    page: {
      /** Number of items per page */
      size: number;
      /** Total number of items across all pages */
      totalElements: number;
      /** Total number of pages */
      totalPages: number;
      /** Current page number (0-based) */
      number: number;
    };
  },
  {
    /** Link to the first page */
    first: Collection<TEntity>;
    /** Link to the previous page */
    prev: Collection<TEntity>;
    /** Link to the current page */
    self: Collection<TEntity>;
    /** Link to the next page */
    next: Collection<TEntity>;
    /** Link to the last page */
    last: Collection<TEntity>;
  }
>;
