import { Separator, SidebarTrigger } from '@shared/ui';
import { Entity, State } from '@hateoas-ts/resource';
import { ModelSettingsDialog } from '../model-settings-dialog';
import { LayoutBreadcrumb } from './layout-breadcrumb';

type LayoutHeaderProps = {
  pathname: string;
  resourceState?: State<Entity>;
};

export function LayoutHeader({ pathname, resourceState }: LayoutHeaderProps) {
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
      <ModelSettingsDialog />
    </header>
  );
}
