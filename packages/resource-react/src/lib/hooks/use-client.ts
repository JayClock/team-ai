import { getResourceContext } from '../provider';
import { useContext } from 'react';
import { Client } from '@hateoas/resource';

export function useClient(): Client {
  const context = useContext(getResourceContext());
  if (!context.resource) {
    throw new Error(
      'To use useClient, you must have a <ResourceProvider> component set up',
    );
  }
  return context.resource.client;
}
