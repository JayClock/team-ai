import { LoaderFunctionArgs } from 'react-router-dom';

export interface LoaderType {
  apiUrl: string;
}

export async function genericLoader({ request }: LoaderFunctionArgs): Promise<LoaderType> {
  const url = new URL(request.url);
  const apiPath = url.pathname.startsWith('/api')
    ? url.pathname
    : `/api${url.pathname}`;

  const apiUrl = `${apiPath}${url.search}`;


  return {
    apiUrl,
  };
}
