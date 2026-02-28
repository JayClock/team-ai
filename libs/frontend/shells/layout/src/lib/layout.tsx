import { Outlet, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@shared/ui';
import { LayoutHeader } from './components/layout-header';
import { LayoutSidebar } from './components/layout-sidebar';

export function Layout() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <LayoutSidebar />
      <SidebarInset>
        <LayoutHeader pathname={location.pathname} />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default Layout;
