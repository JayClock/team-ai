import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { layoutRoutes } from '@shells/layout';
import { apiPrefixGuardLoader } from './api-prefix-guard';

const router = createBrowserRouter([
  {
    path: '/api/*',
    loader: apiPrefixGuardLoader,
  },
  ...layoutRoutes,
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
