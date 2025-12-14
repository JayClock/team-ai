import { Entity, Resource } from '@hateoas/resource';
import { useContext } from 'react';
import { getResourceContext } from '../provider';

export function useRootResource<T extends Entity>(): Resource<T> {
  const context = useContext(getResourceContext());
  if (!context.resource) {
    throw new Error(
      'To use useRootResource, you must have a <ResourceProvider> component set up',
    );
  }
  return context.resource as Resource<T>;
}
