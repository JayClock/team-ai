import {
  Entity,
  ExtractCollectionElement,
  Resource,
  State,
} from '@hateoas-ts/resource';
import { use, useMemo, useRef, useState } from 'react';
import { ResourceLike } from './use-resolve-resource';
import { useSuspenseResolveResource } from './use-suspense-resolve-resource';

/**
 * The result of a useSuspenseInfiniteCollection hook.
 * @category Types
 */
export type UseSuspenseInfiniteCollectionResponse<T extends Entity> = {
  /** Array of collection item states */
  items: State<ExtractCollectionElement<T>>[];
  /** Whether there's a next page available */
  hasNextPage: boolean;
  /** Function to load the next page of items */
  loadNextPage: () => Promise<void>;
  /** True when loading additional pages (not initial load) */
  isLoadingMore: boolean;
  /** Error object if loading more pages failed */
  error: Error | null;
};

/**
 * Suspense-enabled hook for fetching a paginated collection.
 *
 * Uses React 19's `use()` hook to suspend rendering until
 * the initial collection data is available. The promise is cached in useMemo
 * to ensure the same promise reference is used across React re-renders
 * during suspend (React 19 requirement).
 *
 * @category Suspense Hooks
 * @param resourceLike - A Resource, ResourceRelation, or URI string pointing to a collection
 * @returns The collection items, pagination state, and loading functions
 *
 * @example
 * ```tsx
 * import { Suspense } from 'react';
 * import { useSuspenseInfiniteCollection, useClient } from '@hateoas-ts/resource-react';
 * import type { User } from './types';
 *
 * function ConversationList({ userId }: { userId: string }) {
 *   const client = useClient();
 *   const { items, hasNextPage, loadNextPage, isLoadingMore } =
 *     useSuspenseInfiniteCollection(
 *       client.go<User>(`/api/users/${userId}`).follow('conversations')
 *     );
 *
 *   // No initial loading check - suspends until first page is ready
 *   return (
 *     <div>
 *       {items.map((item) => (
 *         <div key={item.data.id}>{item.data.title}</div>
 *       ))}
 *       {hasNextPage && (
 *         <button onClick={loadNextPage} disabled={isLoadingMore}>
 *           {isLoadingMore ? 'Loading...' : 'Load More'}
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 *
 * // Wrap with Suspense boundary
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading conversations...</div>}>
 *       <ConversationList userId="123" />
 *     </Suspense>
 *   );
 * }
 * ```
 *
 * @remarks
 * Requires React 19 or later. For React 18, use {@link useInfiniteCollection} instead.
 */
export function useSuspenseInfiniteCollection<T extends Entity>(
  resourceLike: ResourceLike<T>,
): UseSuspenseInfiniteCollectionResponse<T> {
  const resource = useSuspenseResolveResource(resourceLike);

  const initialPromise = useMemo(() => resource.get(), [resource]);

  const initialState = use(initialPromise);

  const [items, setItems] = useState<State<ExtractCollectionElement<T>>[]>(
    () => [...initialState.collection],
  );

  const nextPageResource = useRef<Resource<T> | null>(
    initialState.hasLink('next') ? initialState.follow('next') : null,
  );

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadNextPageCalled = useRef(false);

  const loadNextPage = async () => {
    if (!nextPageResource.current) {
      console.warn('loadNextPage was called, but there was no next page');
      return;
    }

    if (loadNextPageCalled.current) {
      console.warn(
        'You called loadNextPage(), but it was an old copy. You should not memoize or store a reference to this function, but instead always use the one that was returned last. We ignored this call',
      );
      return;
    }

    loadNextPageCalled.current = true;
    setIsLoadingMore(true);

    try {
      const nextPageState = await nextPageResource.current.get();

      nextPageResource.current = nextPageState.hasLink('next')
        ? nextPageState.follow('next')
        : null;

      setItems((prevItems) => [...prevItems, ...nextPageState.collection]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingMore(false);
      loadNextPageCalled.current = false;
    }
  };

  return {
    items,
    hasNextPage: nextPageResource.current !== null,
    loadNextPage,
    isLoadingMore,
    error,
  };
}
