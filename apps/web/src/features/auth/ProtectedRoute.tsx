import { Navigate } from 'react-router-dom';
import { rootResource } from '../../lib/api-client';
import { useResource } from '@hateoas-ts/resource-react';
import { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { resourceState: rootState } = useResource(rootResource);

  if (rootState?.getLink('login')) {
    return <Navigate to="/login" replace />;
  }

  return <div>{children}</div>;
}
