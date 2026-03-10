import { redirect } from 'react-router-dom';
import { getRootResource } from '../lib/api-client';


export async function protectedRouteLoader() {
  const rootState = await getRootResource().get();

  if (!rootState.getLink('me')) {
    return redirect('/signup');
  }

  return null;
}
