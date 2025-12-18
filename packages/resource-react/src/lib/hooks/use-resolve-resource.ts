import { Entity, Resource } from '@hateoas-ts/resource';
import { useClient } from './use-client';
import { useState } from 'react';

export type ResourceLike<T extends Entity> = Resource<T> | string;

export function useResolveResource<T extends Entity>(
  resourceLike: ResourceLike<T>,
) {
  const client = useClient();
  let res: Resource<T>;
  if (typeof resourceLike === 'string') {
    res = client.go(resourceLike);
  } else {
    res = resourceLike;
  }
  const [resource, setResource] = useState(res);
  return { resource, setResource };
}
