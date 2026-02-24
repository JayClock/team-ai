import { Entity, Resource, State } from '@hateoas-ts/resource';
import { use, useEffect, useMemo, useState } from 'react';
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

export type UseSuspenseReadResourceOptions<T extends Entity> = {
  initialState?: State<T>;
  refreshOnStale?: boolean;
  initialGetRequestHeaders?: Record<string, string>;
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
  options: UseSuspenseReadResourceOptions<T> = {},
): UseSuspenseReadResourceResponse<T> {
  const {
    initialState,
    refreshOnStale = false,
    initialGetRequestHeaders,
  } = options;
  const resource = useSuspenseResolveResource(resourceLike);

  const [liveState, setLiveState] = useState<State<T> | null>(null);
  const [liveError, setLiveError] = useState<Error | null>(null);

  useEffect(() => {
    const onUpdate = (newState: State<T>) => {
      setLiveState(newState.clone());
      setLiveError(null);
    };

    const onStale = () => {
      if (refreshOnStale) {
        resource.refresh().catch((err: unknown) => {
          setLiveError(err instanceof Error ? err : new Error(String(err)));
        });
      }
    };

    resource.on('update', onUpdate);
    resource.on('stale', onStale);

    return function unmount() {
      resource.off('update', onUpdate);
      resource.off('stale', onStale);
    };
  }, [refreshOnStale, resource]);

  const localState =
    liveState?.uri === resource.uri
      ? liveState
      : initialState?.uri === resource.uri
        ? initialState
        : null;

  const getState = useMemo(
    () => () => resource.get({ headers: initialGetRequestHeaders }),
    [initialGetRequestHeaders, resource],
  );

  if (liveError) {
    throw liveError;
  }

  if (localState) {
    return {
      resource,
      resourceState: localState,
    };
  }

  const resourceState = use(getState());

  return {
    resource,
    resourceState,
  };
}
