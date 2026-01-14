import {
  Entity,
  ExtractCollectionElement,
  Resource,
  State,
} from '@hateoas-ts/resource';
import { use, useMemo, useRef, useState } from 'react';
import { ResourceLike } from './use-resolve-resource';
import { useSuspenseResolveResource } from './use-suspense-resolve-resource';

export type UseSuspenseInfiniteCollectionResponse<T extends Entity> = {
  items: State<ExtractCollectionElement<T>>[];
  hasNextPage: boolean;
  loadNextPage: () => Promise<void>;
  isLoadingMore: boolean;
  error: Error | null;
};

/**
 * Suspense-enabled hook for fetching a paginated collection.
 *
 * This hook uses React 19's `use()` hook to suspend rendering until
 * the initial collection data is available. The promise is cached in useMemo
 * to ensure the same promise reference is used across React re-renders
 * during suspend (React 19 requirement).
 *
 * @param resourceLike - A Resource, ResourceRelation, or URI string pointing to a collection
 * @returns The collection items, pagination state, and loading functions
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
