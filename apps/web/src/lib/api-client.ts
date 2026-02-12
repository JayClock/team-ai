import { createClient, FetchMiddleware } from '@hateoas-ts/resource';
import { appConfig } from '../config/app.config';
import { Root } from '@shared/schema';
import { apiKeyStorage } from './api-key-storage';

function buildLoginUrlWithReturnTo(): string {
  const currentPath = window.location.pathname + window.location.search;
  const returnTo = encodeURIComponent(currentPath);
  return `${appConfig.auth.loginPath}?return_to=${returnTo}`;
}

export const apiClient = createClient({
  baseURL: appConfig.api.baseURL,
  sendUserAgent: false,
});

export const rootResource = apiClient.go<Root>('/api');

function createCredentialsMiddleware(): FetchMiddleware {
  return (request, next) => {
    const requestWithCredentials = new Request(request, {
      credentials: 'include',
    });
    return next(requestWithCredentials);
  };
}

function createApiKeyMiddleware(): FetchMiddleware {
  return (request, next) => {
    const apiKey = apiKeyStorage.get();
    if (!apiKey) {
      return next(request);
    }

    const requestWithApiKey = new Request(request);
    requestWithApiKey.headers.set('X-Api-Key', apiKey);
    return next(requestWithApiKey);
  };
}

function createAuthMiddleware(): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (
      response.status === 401 &&
      window.location.pathname !== appConfig.auth.loginPath
    ) {
      window.location.href = buildLoginUrlWithReturnTo();
    }

    return response;
  };
}

apiClient.use(createCredentialsMiddleware());
apiClient.use(createApiKeyMiddleware());
apiClient.use(createAuthMiddleware());
