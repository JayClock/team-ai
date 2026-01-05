import { Entity, Resource, State } from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import { useReadResource } from './use-read-resource';

/**
 * The result of a useResource hook.
 */
export type UseResourceResponse<T extends Entity> = {
  // True if there is no data yet
  loading: boolean;

  // Will contain an Error object, if an error occurred
  error: Error | null;

  // A full Resource State object
  resourceState: State<T>;

  // The 'data' part of the state.
  data: T['data'];

  // The 'real' resource.
  resource: Resource<T>;
};

/**
 * The useResource hook allows you to GET and PUT the state of
 * a resource.
 *
 * Example call:
 *
 * <pre>
 *   const {
 *     loading,
 *     error,
 *     resourceState,
 *     setResourceState,
 *     submit
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
 * * setResourceState - Update the local cache of the resource.
 * * submit - Send a PUT request to the server.
 *
 * If you don't need the full resourceState, you can also use the `data` and
 * `setData` properties instead of `resourceState` or `useResourceState`.
 */
export function useResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
): UseResourceResponse<T> {
  if (resourceLike === undefined) {
    console.warn(
      'useResource was called with "undefined" as the "resourceLike" argument. This is a bug. Did you forget to wait for \'loading\' to complete somewhere?',
    );
  }
  const { resourceState, loading, error, resource } =
    useReadResource<T>(resourceLike);

  return {
    loading,
    error,
    data: resourceState?.data,
    resource,
    resourceState,
  };
}
