import {
  Entity,
  ExtractCollectionElement,
  Resource,
  State,
} from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import { useEffect, useRef, useState } from 'react';
import { useReadResource } from './use-read-resource';

/**
 * Hook for managing infinite scroll/pagination of HATEOAS collection resources.
 *
 * Automatically fetches the initial page and provides functions to load subsequent
 * pages. Uses HAL "next" links for pagination. Items are accumulated across pages.
 *
 * @category Hooks
 * @param resourceLike - A Resource, ResourceRelation, or URI string pointing to a collection
 * @returns Collection items, loading state, pagination info, and loadNextPage function
 *
 * @example
 * ```tsx
 * import { useInfiniteCollection, useClient } from '@hateoas-ts/resource-react';
 * import type { User, Conversation } from './types';
 *
 * function ConversationList({ userId }: { userId: string }) {
 *   const client = useClient();
 *   const userResource = client.go<User>(`/api/users/${userId}`);
 *
 *   const { items, loading, hasNextPage, error, loadNextPage } =
 *     useInfiniteCollection(userResource.follow('conversations'));
 *
 *   return (
 *     <div>
 *       {items.map((item) => (
 *         <div key={item.data.id}>{item.data.title}</div>
 *       ))}
 *
 *       {loading && <div>Loading...</div>}
 *
 *       {hasNextPage && !loading && (
 *         <button onClick={loadNextPage}>Load More</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @remarks
 * - Do not memoize or store the `loadNextPage` function reference
 * - Always use the latest `loadNextPage` function returned by the hook
 */
export function useInfiniteCollection<T extends Entity>(
  resourceLike: ResourceLike<T>,
) {
  const [items, setItems] = useState<State<ExtractCollectionElement<T>>[]>([]);
  const bc = useReadResource(resourceLike);
  const [loading, setLoading] = useState(true);

  const nextPageResource = useRef<Resource<T> | null>(null);
  const [pageError, setPageError] = useState<Error | null>(null);

  useEffect(() => {
    if (!bc.loading) {
      if (bc.resourceState) {
        setItems((prevItems) => {
          return prevItems.concat(bc.resourceState.collection);
        });
        nextPageResource.current = bc.resourceState.hasLink('next')
          ? bc.resourceState.follow('next')
          : null;
      }
      setLoading(false);
    }
  }, [bc.loading, bc.resourceState]);

  let loadNextPageCalled = false;

  const loadNextPage = async () => {
    if (!nextPageResource.current) {
      console.warn('loadNextPage was called, but there was no next page');
      return;
    }
    if (loadNextPageCalled) {
      console.warn(
        'You called loadNextPage(), but it was an old copy. You should not memoize or store a reference to this function, but instead always use the one that was returned last. We ignored this call',
      );
      return;
    }
    loadNextPageCalled = true;

    // We are currently loading a new page
    setLoading(true);

    try {
      const nextPageState = await nextPageResource.current.get();

      // Set up the next page.
      nextPageResource.current = nextPageState.hasLink('next')
        ? nextPageState.follow('next')
        : null;

      setItems((prevItems) => {
        return prevItems.concat(nextPageState.collection);
      });
      setPageError(null);
    } catch (err: any) {
      setPageError(err);
    }
    setLoading(false);
  };
  return {
    items,
    loading,
    hasNextPage: nextPageResource.current !== null,
    error: bc.error ?? pageError ?? null,
    loadNextPage,
  };
}
