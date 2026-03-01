import { LoaderFunctionArgs, redirect } from 'react-router-dom';
import { rootResource } from '../lib/api-client';


export async function protectedRouteLoader({ request }: LoaderFunctionArgs) {
  const rootState = await rootResource.get();

  if (!rootState.getLink('login')) {
    return null;
  }

  throw redirect(`/login`);
}
