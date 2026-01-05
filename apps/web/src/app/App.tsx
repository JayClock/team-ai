import { XProvider } from '@ant-design/x';
import { ResourceProvider } from '@hateoas-ts/resource-react';
import { AppLayout } from '../features/layout/AppLayout';
import { Login } from '../features/auth/Login';
import { AppRoutes } from '../routes/AppRoutes';
import { apiClient } from '../lib/api-client';
import { Route, Routes } from 'react-router-dom';

export default function App() {
  const { headerContent, mainContent, rightContent } = AppRoutes();

  return (
    <XProvider>
      <ResourceProvider client={apiClient}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <AppLayout
                headerContent={headerContent}
                rightContent={rightContent}
              >
                {mainContent}
              </AppLayout>
            }
          />
        </Routes>
      </ResourceProvider>
    </XProvider>
  );
}
