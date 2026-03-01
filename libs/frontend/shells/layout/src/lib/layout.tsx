import { Entity, State } from '@hateoas-ts/resource';
import { useClient } from '@hateoas-ts/resource-react';
import { SidebarInset, SidebarProvider } from '@shared/ui';
import { use, useMemo } from 'react';
import { Outlet, useLocation, useRouteLoaderData } from 'react-router-dom';
import { LoaderType } from './generic-loader';
import { LayoutOutletContext } from './layout-outlet-context';
import { LAYOUT_PREFER } from './resource-prefer';
import { RESOURCE_ROUTE_ID } from './route';
import { LayoutHeader } from './components/layout-header';
import { LayoutSidebar } from './components/layout-sidebar';

export function Layout() {
  const location = useLocation();
  const client = useClient();
  const data = useRouteLoaderData(RESOURCE_ROUTE_ID) as LoaderType | undefined;
  const resourcePromise = useMemo(
    () =>
      data?.apiUrl
        ? client.go<Entity>(data.apiUrl).get({
            headers: {
              Prefer: LAYOUT_PREFER,
            },
          })
        : Promise.resolve(undefined),
    [client, data?.apiUrl],
  );
  const resourceState = use(resourcePromise) as State<Entity> | undefined;

  return (
    <SidebarProvider>
      <LayoutSidebar resourceState={resourceState} />
      <SidebarInset>
        <LayoutHeader pathname={location.pathname} resourceState={resourceState} />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet context={{ resourceState } satisfies LayoutOutletContext} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default Layout;
