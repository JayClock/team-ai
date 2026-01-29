import { LoaderFunctionArgs } from "react-router-dom";
import { apiClient } from '@shared/util-http'

export interface LoaderType {
  contentType: string
  apiUrl: string
}

export async function genericLoader({ request }: LoaderFunctionArgs): Promise<LoaderType> {
  const url = new URL(request.url);
  const apiPath = url.pathname.startsWith("/api")
    ? url.pathname
    : `/api${url.pathname}`;

  const apiUrl = `${apiPath}${url.search}`;

  const res = await apiClient.go(apiUrl).get()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const rawType = res.contentHeaders().get('content-type')!;
  const contentType = rawType.split(';')[0].trim();
  return {
    contentType,
    apiUrl,
  };
}
