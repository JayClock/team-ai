import { useLoaderData } from 'react-router-dom';
import { LoaderType } from './generic-loader';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { Cockpit } from '@shells/cockpit';
import { Entity } from '@hateoas-ts/resource';

export function ResourceRenderer() {
  const client = useClient();
  const { apiUrl } = useLoaderData<LoaderType>();
  const { resourceState } = useSuspenseResource<Entity<never, never>>(
    client.go(apiUrl),
  );
  return <Cockpit state={resourceState}></Cockpit>;
}
