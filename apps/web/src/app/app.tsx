import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { Login } from '../features/auth/login';
import { Signup } from '../features/auth/signup';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { layoutRoutes } from '@shells/layout';
import { apiPrefixGuardLoader } from './api-prefix-guard';
import { protectedRouteLoader } from './protected-route-loader';

const protectedLayoutRoutes = layoutRoutes.map((route) => ({
  ...route,
  loader: protectedRouteLoader,
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
  {
    path: '/signup',
    element: <Signup />,
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
