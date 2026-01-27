import { RouteObject } from 'react-router-dom';
import { Layout } from './layout';
import { Suspense } from 'react';
import { Cockpit } from '@shells/cockpit';

export const layoutRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <Suspense>
        <Layout />
      </Suspense>
    ),
    children: [
      {
        path: 'cockpit',
        element: (
          <Suspense>
            <Cockpit />
          </Suspense>
        ),
      },
    ],
  },
];
