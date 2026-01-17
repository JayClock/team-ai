import { Login } from '../features/auth/login';
import { ProtectedRoute } from '../features/auth/protected-route';
import { SettingsDialog } from '../features/settings/settings-dialog';
import { AppRoutes } from '../routes/app-routes';
import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { Route, Routes } from 'react-router-dom';
import { Suspense } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@shared/ui/components/sidebar';
import { Spinner } from '@shared/ui/components/spinner';
import { Button } from '@shared/ui/components/button';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function AppLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const errorMessage =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <svg
          className="h-6 w-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      </div>
      <Button variant="outline" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  );
}

function MainApp() {
  const { sidebarHeader, sidebarContent, mainContent, conversationTitle } =
    AppRoutes();

  return (
    <SidebarProvider className="h-full">
      <Sidebar className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
          {sidebarHeader}
        </SidebarHeader>
        <SidebarContent>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>{sidebarContent}</Suspense>
          </ErrorBoundary>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1 truncate font-medium">{conversationTitle}</div>
          <SettingsDialog />
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>{mainContent}</Suspense>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>
              <Homepage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/smart-domain"
        element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>
              <SmartDomainPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/login"
        element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>
              <Login />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/*"
        element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<AppLoading />}>
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            </Suspense>
          </ErrorBoundary>
        }
      />
    </Routes>
  );
}
