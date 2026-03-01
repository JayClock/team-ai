import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { Login } from '../features/auth/login';
import { ProtectedRoute } from '../features/auth/protected-route';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { layoutRoutes } from '@shells/layout';
import { apiPrefixGuardLoader } from './api-prefix-guard';

const protectedLayoutRoutes = layoutRoutes.map((route) => ({
  ...route,
  element: <ProtectedRoute>{route.element}</ProtectedRoute>,
}));

const router = createBrowserRouter([
  {
    path: '/api/*',
    loader: apiPrefixGuardLoader,
  },
  {
    path: '/login',
    element: <Login />,
  },
  ...protectedLayoutRoutes,
  {
    path: '/home',
    element: <Homepage />,
  },
  {
    path: '/smart-domain',
    element: <SmartDomainPage />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
