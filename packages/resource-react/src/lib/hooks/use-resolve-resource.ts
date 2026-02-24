import { Entity, Resource, ResourceRelation } from '@hateoas-ts/resource';
import { useClient } from './use-client';
import { useEffect, useState } from 'react';

export type ResourceLike<T extends Entity> =
  | Resource<T>
  | ResourceRelation<T>
  | string;

function isResourceRelation<T extends Entity>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
): obj is ResourceRelation<T> {
  return obj && typeof obj.getResource === 'function';
}

export function useResolveResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
) {
  const client = useClient();
  const [resource, setResource] = useState<Resource<T> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (typeof resourceLike === 'string') {
      setResource(client.go(resourceLike));
    } else if (isResourceRelation(resourceLike)) {
      resourceLike
        .getResource()
        .then((res) => setResource(res))
        .catch((err) => setError(err));
    } else {
      setResource(resourceLike);
    }
  }, [client, resourceLike]);
  return { resource, setResource, error };
}
