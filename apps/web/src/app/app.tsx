import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { Login } from '../features/auth/login';
import { Signup } from '../features/auth/signup';
import ProjectHome from '../features/projects/project-home';
import ProjectSessionPage from '../features/projects/project-session-page';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { layoutRoutes } from '@shells/layout';
import { apiPrefixGuardLoader } from './api-prefix-guard';
import { protectedRouteLoader } from './protected-route-loader';
import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';

const protectedLayoutRoutes = [
  {
    path: '/api/*',
    loader: apiPrefixGuardLoader,
  },
  ...layoutRoutes.map((route) => ({
    ...route,
    loader: protectedRouteLoader,
  })),
];

function createAppRouter() {
  return createBrowserRouter([
    {
      path: '/',
      loader: protectedRouteLoader,
      element: <ProjectHome />,
    },
    {
      path: '/sessions/:sessionId',
      loader: protectedRouteLoader,
      element: <ProjectSessionPage />,
    },
    ...protectedLayoutRoutes,
    {
      path: '/projects',
      loader: protectedRouteLoader,
      element: <Navigate to="/" replace />,
    },
    {
      path: '/projects/:projectId',
      loader: protectedRouteLoader,
      element: <Navigate to="/" replace />,
    },
    {
      path: '/projects/:projectId/sessions/:sessionId',
      loader: protectedRouteLoader,
      element: <ProjectSessionPage />,
    },
    {
      path: '/login',
      element: <Login />,
    },
    {
      path: '/signup',
      element: <Signup />,
    },
    {
      path: '/home',
      element: <Homepage />,
    },
    {
      path: '/smart-domain',
      element: <SmartDomainPage />,
    },
  ]);
}

export default function App() {
  const router = useMemo(() => createAppRouter(), []);
  return <RouterProvider router={router} />;
}
