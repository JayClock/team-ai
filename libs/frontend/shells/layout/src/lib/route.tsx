import { RouteObject } from 'react-router-dom';
import { Layout } from './layout';
import { Suspense } from 'react';
import { genericLoader } from './generic-loader';
import { ResourceRenderer } from './resource-rendener';


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
        path: '*',
        loader: genericLoader,
        hydrateFallbackElement: <div />,
        element: <ResourceRenderer />,
      },
    ],
  },
];
