import { Entity, Resource, ResourceRelation } from '@hateoas-ts/resource';
import { useClient } from './use-client';
import { use, useMemo } from 'react';
import { ResourceLike } from './use-resolve-resource';

function isResourceRelation<T extends Entity>(
  obj: unknown,
): obj is ResourceRelation<T> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'getResource' in obj &&
    typeof obj.getResource === 'function'
  );
}

/**
 * Suspense-enabled hook to resolve a ResourceLike to a Resource.
 *
 * This hook handles three cases:
 * 1. String URI - uses client.go() to create a Resource
 * 2. ResourceRelation - suspends while resolving to a Resource
 * 3. Resource - returns as-is
 *
 * The promise is cached in useMemo to ensure the same promise reference
 * is used across React re-renders during suspend (React 19 requirement).
 *
 * @param resourceLike - A Resource, ResourceRelation, or URI string
 * @returns The resolved Resource
 */
export function useSuspenseResolveResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
): Resource<T> {
  const client = useClient();

  // For ResourceRelation, we need to cache the promise to avoid
  // creating a new promise on each render during suspend
  const resourceRelationPromise = useMemo(() => {
    if (isResourceRelation(resourceLike)) {
      return resourceLike.getResource();
    }
    return null;
  }, [resourceLike]);

  if (typeof resourceLike === 'string') {
    return client.go(resourceLike);
  }

  if (resourceRelationPromise) {
    return use(resourceRelationPromise);
  }

  return resourceLike as Resource<T>;
}
