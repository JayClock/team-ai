import { RouteObject } from 'react-router-dom';
import { Layout } from './layout';
import { Suspense } from 'react';
import { genericLoader } from './generic-loader';
import { ResourceRenderer } from './resource-rendener';

export const RESOURCE_ROUTE_ID = 'resource-route';

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
        id: RESOURCE_ROUTE_ID,
        path: '*',
        loader: genericLoader,
        hydrateFallbackElement: <div />,
        element: <ResourceRenderer />,
      },
    ],
  },
];
