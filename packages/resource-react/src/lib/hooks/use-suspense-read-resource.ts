import { Entity, Resource, State } from '@hateoas-ts/resource';
import { use, useMemo } from 'react';
import { ResourceLike } from './use-resolve-resource';
import { useSuspenseResolveResource } from './use-suspense-resolve-resource';

/**
 * The result of a useSuspenseReadResource hook.
 * @category Types
 */
export type UseSuspenseReadResourceResponse<T extends Entity> = {
  /** A full Resource State object */
  resourceState: State<T>;
  /** The resolved resource object */
  resource: Resource<T>;
};

/**
 * Internal Suspense-enabled hook for reading resource state.
 *
 * Similar to `useReadResource` in the non-Suspense flow, this hook centralizes
 * the state-loading plumbing for Suspense hooks so they can share one
 * implementation.
 *
 * @param resourceLike - A Resource, ResourceRelation, or URI string
 * @returns The resolved resource and loaded state
 */
export function useSuspenseReadResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
): UseSuspenseReadResourceResponse<T> {
  const resource = useSuspenseResolveResource(resourceLike);

  const getPromise = useMemo(() => resource.get(), [resource]);
  const resourceState = use(getPromise);

  return {
    resource,
    resourceState,
  };
}
