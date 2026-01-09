import { createClient, FetchMiddleware } from '@hateoas-ts/resource';
import { appConfig } from '../config/app.config';
import { Root } from '@shared/schema';

const AUTH_TRANSPORT_COOKIE = 'auth_transport';
const TOKEN_STORAGE_KEY = 'auth_token';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

function extractTokenFromCookie(): string | null {
  const token = getCookie(AUTH_TRANSPORT_COOKIE);
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    clearCookie(AUTH_TRANSPORT_COOKIE);
    return token;
  }
  return null;
}

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function initializeToken(): string | null {
  return extractTokenFromCookie() || getStoredToken();
}

let currentToken: string | null = initializeToken();

export function clearToken(): void {
  currentToken = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

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

function createBearerTokenMiddleware(): FetchMiddleware {
  return (request, next) => {
    if (currentToken) {
      const requestWithAuth = new Request(request, {
        headers: new Headers(request.headers),
      });
      requestWithAuth.headers.set('Authorization', `Bearer ${currentToken}`);
      return next(requestWithAuth);
    }
    return next(request);
  };
}

function createCredentialsMiddleware(): FetchMiddleware {
  return (request, next) => {
    const requestWithCredentials = new Request(request, {
      credentials: 'include',
    });
    return next(requestWithCredentials);
  };
}

function createAuthMiddleware(): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (
      response.status === 401 &&
      window.location.pathname !== appConfig.auth.loginPath
    ) {
      clearToken();
      window.location.href = buildLoginUrlWithReturnTo();
    }

    return response;
  };
}

apiClient.use(createBearerTokenMiddleware());
apiClient.use(createCredentialsMiddleware());
apiClient.use(createAuthMiddleware());
