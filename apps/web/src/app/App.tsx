import { AppLayout } from '../features/layout/AppLayout';
import { Login } from '../features/auth/Login';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AppRoutes } from '../routes/AppRoutes';
import { Route, Routes } from 'react-router-dom';

export default function App() {
  const { headerContent, mainContent, rightContent } = AppRoutes();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout
              headerContent={headerContent}
              rightContent={rightContent}
            >
              {mainContent}
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
