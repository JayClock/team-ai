import { Entity, Resource, State } from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import {
  UseSuspenseReadResourceOptions,
  useSuspenseReadResource,
} from './use-suspense-read-resource';

/**
 * The result of a useSuspenseResource hook.
 * @category Types
 */
export type UseSuspenseResourceResponse<T extends Entity> = {
  /** A full Resource State object */
  resourceState: State<T>;
  /** The 'data' part of the state */
  data: T['data'];
  /** The resolved resource object */
  resource: Resource<T>;
};

export type UseSuspenseResourceOptions<T extends Entity> =
  UseSuspenseReadResourceOptions<T>;

/**
 * Suspense-enabled hook for fetching a resource.
 *
 * Uses React 19's `use()` hook to suspend rendering until
 * the resource data is available. The promise is cached in useMemo
 * to ensure the same promise reference is used across React re-renders
 * during suspend (React 19 requirement).
 *
 * @category Suspense Hooks
 * @param resourceLike - A Resource, ResourceRelation, or URI string
 * @returns The resolved resource state, data, and resource object
 *
 * @example
 * ```tsx
 * import { Suspense } from 'react';
 * import { useSuspenseResource, useClient } from '@hateoas-ts/resource-react';
 * import type { User } from './types';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useClient();
 *   const { data } = useSuspenseResource(
 *     client.go<User>(`/api/users/${userId}`)
 *   );
 *
 *   // No loading check needed - component suspends until data is ready
 *   return <div>Welcome, {data.name}!</div>;
 * }
 *
 * // Wrap with Suspense boundary
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <UserProfile userId="123" />
 *     </Suspense>
 *   );
 * }
 * ```
 *
 * @remarks
 * Requires React 19 or later. For React 18, use {@link useResource} instead.
 */
export function useSuspenseResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
  options: UseSuspenseResourceOptions<T> = {},
): UseSuspenseResourceResponse<T> {
  const { resource, resourceState } = useSuspenseReadResource(
    resourceLike,
    options,
  );

  return {
    data: resourceState.data,
    resource,
    resourceState,
  };
}
