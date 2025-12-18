import { Client } from '@hateoas-ts/resource';
import { useContext } from 'react';
import { ClientContext } from '../provider';

export function useClient(): Client {
  const context = useContext(ClientContext);
  if (!context.client) {
    throw new Error(
      'To use useClient, you must have a <ResourceProvider> component set up',
    );
  }
  return context.client;
}
