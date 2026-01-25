import Homepage from '../features/landing/homepage';
import SmartDomainPage from '../features/landing/smart-domain-page';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { layoutRoutes } from '@shells/layout';

const router = createBrowserRouter([
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
