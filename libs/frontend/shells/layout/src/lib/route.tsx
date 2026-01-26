import { RouteObject } from 'react-router-dom';
import { Layout } from './layout';
import { Suspense } from 'react';

export const layoutRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <Suspense>
        <Layout />
      </Suspense>
    ),
  },
];
