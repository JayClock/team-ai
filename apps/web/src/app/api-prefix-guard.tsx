import { Navigate, useLocation } from 'react-router-dom';

function stripApiPrefix(pathname: string): string {
  if (pathname === '/api') {
    return '/';
  }
  if (pathname.startsWith('/api/')) {
    return pathname.slice(4);
  }
  return pathname;
}

export function ApiPrefixGuard() {
  const location = useLocation();
  const pathname = stripApiPrefix(location.pathname);
  const target = `${pathname}${location.search}${location.hash}`;

  return <Navigate to={target} replace />;
}

