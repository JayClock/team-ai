import { Login } from '../features/auth/Login';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AppRoutes } from '../routes/AppRoutes';
import { Route, Routes } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@shared/ui/components/sidebar';

export default function App() {
  const { sidebarHeader, sidebarContent, mainContent, conversationTitle } =
    AppRoutes();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SidebarProvider className="h-full">
              <Sidebar className="border-r border-sidebar-border">
                <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
                  {sidebarHeader}
                </SidebarHeader>
                <SidebarContent>{sidebarContent}</SidebarContent>
              </Sidebar>
              <SidebarInset className="flex flex-col">
                <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
                  <SidebarTrigger className="-ml-1" />
                  <div className="flex-1 truncate font-medium">
                    {conversationTitle}
                  </div>
                </header>
                <main className="flex flex-1 flex-col overflow-hidden">
                  {mainContent}
                </main>
              </SidebarInset>
            </SidebarProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
