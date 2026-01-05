import { createClient, FetchMiddleware } from '@hateoas-ts/resource';
import { Root } from '@shared/schema';

export const client = createClient({ baseURL: 'http://localhost:4200' });
client.use(AuthMiddleware());

export const rootResource = client.go<Root>('/api');

function AuthMiddleware(): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (response.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }

    return response;
  };
}
