import { Separator, SidebarTrigger } from '@shared/ui';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Project } from '@shared/schema';
import { ModelSettingsDialog } from '../model-settings-dialog';
import { LayoutBreadcrumb } from './layout-breadcrumb';

type LayoutHeaderProps = {
  pathname: string;
  resourceState?: State<Entity>;
};

export function LayoutHeader({ pathname, resourceState }: LayoutHeaderProps) {
  const projectResource =
    resourceState && resourceState.hasLink('project')
      ? (resourceState.follow('project') as Resource<Project>)
      : undefined;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <SidebarTrigger className="-ml-1" />
        <Separator
          className="mr-2 data-[orientation=vertical]:h-4"
          orientation="vertical"
        />
        <LayoutBreadcrumb pathname={pathname} resourceState={resourceState} />
      </div>
      <div className="flex items-center gap-3">
        {projectResource ? (
          <LayoutHeaderProjectName projectResource={projectResource} />
        ) : null}
        <ModelSettingsDialog />
      </div>
    </header>
  );
}

function LayoutHeaderProjectName(props: { projectResource: Resource<Project> }) {
  const { projectResource } = props;
  const { resourceState } = useSuspenseResource<Project>(projectResource);

  if (!resourceState.data.name) {
    return null;
  }

  return (
    <div className="hidden max-w-56 truncate text-sm text-muted-foreground md:block">
      {resourceState.data.name}
    </div>
  );
}
