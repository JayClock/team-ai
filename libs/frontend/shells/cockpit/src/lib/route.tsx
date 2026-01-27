import { RouteObject } from 'react-router-dom';
import { Cockpit } from './cockpit';
import { Suspense } from 'react';

export const cockpitRoutes: RouteObject[] = [
  {
    path: 'cockpit',
    element: (
      <Suspense>
        <Cockpit />
      </Suspense>
    ),
  },
];
