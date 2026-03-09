import { LoaderFunctionArgs, redirect } from 'react-router-dom';
import { getRootResource } from '../lib/api-client';


export async function protectedRouteLoader({ request }: LoaderFunctionArgs) {
  const rootState = await getRootResource().get();

  if (!rootState.getLink('me')) {
    redirect(`/signup`);
  }
}
