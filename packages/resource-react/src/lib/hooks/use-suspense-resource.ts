import { Entity, Resource, State } from '@hateoas-ts/resource';
import { use, useMemo } from 'react';
import { ResourceLike } from './use-resolve-resource';
import { useSuspenseResolveResource } from './use-suspense-resolve-resource';

export type UseSuspenseResourceResponse<T extends Entity> = {
  resourceState: State<T>;
  data: T['data'];
  resource: Resource<T>;
};

/**
 * Suspense-enabled hook for fetching a resource.
 *
 * This hook uses React 19's `use()` hook to suspend rendering until
 * the resource data is available. The promise is cached in useMemo
 * to ensure the same promise reference is used across React re-renders
 * during suspend (React 19 requirement).
 *
 * @param resourceLike - A Resource, ResourceRelation, or URI string
 * @returns The resolved resource state, data, and resource object
 */
export function useSuspenseResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
): UseSuspenseResourceResponse<T> {
  const resource = useSuspenseResolveResource(resourceLike);

  const promise = useMemo(() => resource.withGet().request(), [resource]);

  const resourceState = use(promise);

  return {
    data: resourceState.data,
    resource,
    resourceState,
  };
}
