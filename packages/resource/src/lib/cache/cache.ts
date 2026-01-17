import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';

/**
 * Interface for caching resource State objects.
 *
 * Implementations provide storage strategies (e.g., memory, persistent)
 * for caching fetched resource states to improve performance.
 *
 * @category Other
 */
export interface Cache {
  /**
   * Stores a State object in the cache.
   *
   * The state will be cloned before storing to prevent mutation.
   *
   * @param state - The State object to cache
   */
  store: (state: State) => void;

  /**
   * Retrieves a cached State by its URI.
   *
   * @typeParam T - The entity type of the cached state
   * @param uri - The absolute URI of the resource
   * @returns The cached State or `null` if not found
   */
  get: <T extends Entity>(uri: string) => State<T> | null;

  /**
   * Checks if a State exists in the cache.
   *
   * @param uri - The absolute URI to check
   * @returns `true` if the URI is cached
   */
  has: (uri: string) => boolean;

  /**
   * Removes a State from the cache.
   *
   * @param uri - The absolute URI to remove
   */
  delete: (uri: string) => void;

  /**
   * Clears all entries from the cache.
   */
  clear: () => void;
}
