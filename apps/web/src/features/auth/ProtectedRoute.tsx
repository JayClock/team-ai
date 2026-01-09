import { Navigate, useLocation } from 'react-router-dom';
import { rootResource } from '../../lib/api-client';
import { useResource } from '@hateoas-ts/resource-react';
import { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { resourceState: rootState } = useResource(rootResource);
  const location = useLocation();

  if (rootState?.getLink('login')) {
    const currentPath = location.pathname + location.search;
    const returnTo = encodeURIComponent(currentPath);
    return <Navigate to={`/login?return_to=${returnTo}`} replace />;
  }

  return <div>{children}</div>;
}
