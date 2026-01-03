import { Entity, Resource, State as ResourceState } from '@hateoas-ts/resource';
import { useEffect, useState } from 'react';
import { ResourceLike, useResolveResource } from './use-resolve-resource';

type UseReadResourceResponse<T extends Entity> = {
  // True if there is no data yet
  loading: boolean;
  error: Error | null;

  /**
   * The ResourceState.
   *
   * Note that this will be `null` until loading is "false".
   */
  resourceState: ResourceState<T>;

  /**
   * The 'real' resource.
   *
   * This will be `null` until we have it. It's not typed null because it
   * makes it very clumsy to work with the hook.
   */
  resource: Resource<T>;

  /**
   * Change the resource that the hook uses.
   *
   * A reason you might want to do this is if the resource itself changed
   * uris.
   */
  setResource(resource: Resource<T>): void;
};

export type UseReadResourceOptions<T extends Entity> = {
  initialState?: ResourceState<T>;
};

/**
 * The useReadResource hook is an internal hook that helps to set up a lot of
 * the plumbing for dealing with resources and state.
 *
 * It's not recommended for external users to use this directly, instead use
 * one of the more specialized hooks such as useResource or useCollection.
 *
 * Example call:
 *
 * <pre>
 *   const {
 *     loading,
 *     error,
 *     resourceState,
 *  } = useResource(resource);
 * </pre>
 *
 * Returned properties:
 *
 * * loading - will be true as long as the result is still being fetched from
 *             the server.
 * * error - Will be null or an error object.
 * * resourceState - A state object. The `.data` property of this object will
 *                   contain the parsed JSON from the server.
 */
export function useReadResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
): UseReadResourceResponse<T> {
  const { resource, setResource } = useResolveResource(resourceLike);
  const [resourceState, setResourceState] = useState<ResourceState<T>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | Error>(null);

  useEffect(() => {
    // This effect is for fetching the initial ResourceState
    if (resource == null) {
      // No need to fetch resourceState for these cases.
      return;
    }
    setLoading(true);
    resource
      .withGet()
      .request()
      .then((state) => {
        setResourceState(state);
      })
      .catch((error) => {
        setError(error);
      })
      .finally(() => setLoading(false));
  }, [resource]);

  return {
    loading,
    error,
    resourceState: resourceState as ResourceState<T>,
    resource: resource as Resource<T>,
    setResource,
  };
}
