import { lazy, Suspense, useMemo } from 'react';
import { useLoaderData } from 'react-router-dom';
import { LoaderType } from './generic-loader';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { Entity, State } from '@hateoas-ts/resource';
import { type Signal, signal } from '@preact/signals-react';

const ProjectDiagrams = lazy(() =>
  import('@features/project-diagrams').then((m) => ({
    default: m.FeaturesProjectDiagrams,
  })),
);

const Diagram = lazy(() =>
  import('@shells/diagram').then((m) => ({ default: m.ShellsDiagram })),
);

const COMPONENT_MAP: Record<
  string,
  React.LazyExoticComponent<
    React.ComponentType<{ state: Signal<State<Entity<never, never>>> }>
  >
> = {
  'application/vnd.business-driven-ai.diagrams+json': ProjectDiagrams,
  'application/vnd.business-driven-ai.diagram+json': Diagram,
};

export type ResourceRendererContentType = keyof typeof COMPONENT_MAP;

export function ResourceRenderer() {
  const client = useClient();
  const { apiUrl, contentType } = useLoaderData<LoaderType>();
  const { resourceState } = useSuspenseResource<Entity<never, never>>(
    client.go(apiUrl),
  );
  const Component = COMPONENT_MAP[contentType];
  const stateSignal = useMemo(() => signal(resourceState), [resourceState]);

  if (!Component) {
    return (
      <UnknownResource
        key={apiUrl}
        contentType={contentType}
        state={stateSignal}
      />
    );
  }

  return (
    <Suspense>
      <Component key={apiUrl} state={stateSignal}></Component>
    </Suspense>
  );
}

function UnknownResource(props: {
  contentType: string;
  state: Signal<State<Entity<never, never>>>;
}) {
  const { contentType, state } = props;
  const snapshot = {
    uri: state.value.uri,
    data: state.value.data,
    collectionSize: state.value.collection.length,
  };

  return (
    <div className="h-full overflow-auto p-4">
      <h2 className="text-lg font-semibold">Unsupported Resource Type</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No renderer is registered for <code>{contentType}</code>.
      </p>
      <pre className="mt-4 overflow-auto rounded-md border bg-muted p-3 text-xs">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  );
}
