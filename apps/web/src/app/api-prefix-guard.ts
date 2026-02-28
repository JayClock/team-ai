import { LoaderFunctionArgs, redirect } from 'react-router-dom';

function stripApiPrefix(pathname: string): string {
  if (pathname === '/api') {
    return '/';
  }
  if (pathname.startsWith('/api/')) {
    return pathname.slice(4);
  }
  return pathname;
}

export function apiPrefixGuardLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pathname = stripApiPrefix(url.pathname);
  const target = `${pathname}${url.search}${url.hash}`;

  throw redirect(target);
}
