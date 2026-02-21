import { lazy, Suspense } from 'react';
import { useLoaderData } from 'react-router-dom';
import { LoaderType } from './generic-loader';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { Entity, State } from '@hateoas-ts/resource';
import { type Signal, useSignal } from '@preact/signals-react';

const Cockpit = lazy(() =>
  import('@shells/cockpit').then((m) => ({ default: m.Cockpit })),
);

const Diagram = lazy(() =>
  import('@shells/diagram').then((m) => ({ default: m.ShellsDiagram })),
);

export function ResourceRenderer() {
  const client = useClient();
  const { apiUrl, contentType } = useLoaderData<LoaderType>();
  const { resourceState } = useSuspenseResource<Entity<never, never>>(
    client.go(apiUrl),
  );
  const Component = COMPONENT_MAP[contentType];
  const signal = useSignal(resourceState);
  return (
    <Suspense>
      <Component state={signal}></Component>
    </Suspense>
  );
}

const COMPONENT_MAP: Record<
  string,
  React.LazyExoticComponent<
    React.ComponentType<{ state: Signal<State<Entity<never, never>>> }>
  >
> = {
  'application/vnd.business-driven-ai.project+json': Cockpit,
  'application/vnd.business-driven-ai.diagram+json': Diagram,
};
