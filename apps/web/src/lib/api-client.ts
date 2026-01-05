import { createClient, FetchMiddleware } from '@hateoas-ts/resource';
import { appConfig } from '../config/app.config';

export const apiClient = createClient({
  baseURL: appConfig.api.baseURL,
});

function createAuthMiddleware(): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (
      response.status === 401 &&
      window.location.pathname !== appConfig.auth.loginPath
    ) {
      window.location.href = appConfig.auth.loginPath;
    }

    return response;
  };
}

apiClient.use(createAuthMiddleware());
