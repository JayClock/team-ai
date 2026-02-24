import { Entity, Resource, State } from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import { UseReadResourceOptions, useReadResource } from './use-read-resource';

/**
 * The result of a useResource hook.
 * @category Types
 */
export type UseResourceResponse<T extends Entity> = {
  /** True if there is no data yet */
  loading: boolean;

  /** Will contain an Error object if an error occurred */
  error: Error | null;

  /** A full Resource State object */
  resourceState: State<T>;

  /** The 'data' part of the state */
  data: T['data'];

  /** The resolved resource object */
  resource: Resource<T>;
};

export type UseResourceOptions<T extends Entity> = UseReadResourceOptions<T>;

/**
 * Hook for fetching and managing a single HATEOAS resource.
 *
 * Automatically fetches the resource on mount and returns loading/error states
 * along with the resource data. Use this hook when you need to display a single
 * entity (not a collection).
 *
 * @category Hooks
 * @param resourceLike - A Resource, ResourceRelation, or URI string
 * @returns Loading state, error, and resource data
 *
 * @example
 * ```tsx
 * import { useResource, useClient } from '@hateoas-ts/resource-react';
 * import type { User } from './types';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useClient();
 *   const userResource = client.go<User>(`/api/users/${userId}`);
 *
 *   const { loading, error, data, resourceState } = useResource(userResource);
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return <div>Welcome, {data.name}!</div>;
 * }
 * ```
 *
 * @example Following relations
 * ```tsx
 * // Follow a HATEOAS link to get a related resource
 * const { data: profile } = useResource(
 *   userResource.follow('profile')
 * );
 * ```
 */
export function useResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
  options: UseResourceOptions<T> = {},
): UseResourceResponse<T> {
  if (resourceLike === undefined) {
    console.warn(
      'useResource was called with "undefined" as the "resourceLike" argument. This is a bug. Did you forget to wait for \'loading\' to complete somewhere?',
    );
  }
  const { resourceState, loading, error, resource } =
    useReadResource<T>(resourceLike, options);

  return {
    loading,
    error,
    data: resourceState?.data,
    resource,
    resourceState,
  };
}
