import { createClient, FetchMiddleware } from '@hateoas-ts/resource';
import {
  appConfig,
  getDesktopRuntimeConfig,
  type DesktopRuntimeConfig,
} from './config/app.config.js';
import { Root } from '@shared/schema';
import { halFormsJsonSchemaZodSchemaPlugin } from './hal-forms-json-schema-zod-schema-plugin.js';

interface ClientRuntimeConfig {
  apiBaseURL: string;
  desktopRuntimeConfig: DesktopRuntimeConfig | null;
}

function buildLoginUrlWithReturnTo(): string {
  const currentPath = window.location.pathname + window.location.search;
  const returnTo = encodeURIComponent(currentPath);
  return `${appConfig.auth.loginPath}?return_to=${returnTo}`;
}

function createClientRuntimeConfig(
  desktopRuntimeConfig: DesktopRuntimeConfig | null,
): ClientRuntimeConfig {
  return {
    apiBaseURL: desktopRuntimeConfig?.apiBaseUrl ?? appConfig.api.baseURL,
    desktopRuntimeConfig,
  };
}

function createConfiguredClient(runtimeConfig: ClientRuntimeConfig) {
  const client = createClient({
    baseURL: runtimeConfig.apiBaseURL,
    sendUserAgent: false,
    schemaPlugin: halFormsJsonSchemaZodSchemaPlugin,
  });

  client.use(createCredentialsMiddleware());
  client.use(createApiKeyMiddleware());
  client.use(createDesktopSessionMiddleware(runtimeConfig));
  client.use(createAuthMiddleware(runtimeConfig));

  return client;
}

function createCredentialsMiddleware(): FetchMiddleware {
  return (request, next) => {
    const requestWithCredentials = new Request(request, {
      credentials: 'include',
    });
    return next(requestWithCredentials);
  };
}

function createDesktopSessionMiddleware(
  runtimeConfig: ClientRuntimeConfig,
): FetchMiddleware {
  return (request, next) => {
    const desktopRuntimeConfig = runtimeConfig.desktopRuntimeConfig;

    if (!desktopRuntimeConfig) {
      return next(request);
    }

    const requestWithDesktopSession = new Request(request);
    requestWithDesktopSession.headers.set(
      desktopRuntimeConfig.desktopSessionHeader,
      desktopRuntimeConfig.desktopSessionToken,
    );

    return next(requestWithDesktopSession);
  };
}

function createApiKeyMiddleware(): FetchMiddleware {
  return (request, next) => {
    const apiKey = localStorage.getItem('api-key');
    if (!apiKey) {
      return next(request);
    }

    const requestWithApiKey = new Request(request);
    requestWithApiKey.headers.set('X-Api-Key', apiKey);
    return next(requestWithApiKey);
  };
}

function createAuthMiddleware(runtimeConfig: ClientRuntimeConfig): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (
      response.status === 401 &&
      !runtimeConfig.desktopRuntimeConfig &&
      window.location.pathname !== appConfig.auth.loginPath
    ) {
      window.location.href = buildLoginUrlWithReturnTo();
    }

    return response;
  };
}

let currentRuntimeConfig = createClientRuntimeConfig(null);

export let apiClient = createConfiguredClient(currentRuntimeConfig);

export let rootResource = apiClient.go<Root>('/api');

export function getRootResource() {
  return apiClient.go<Root>('/api');
}

export function getCurrentApiBaseUrl(): string {
  return currentRuntimeConfig.apiBaseURL;
}

export function getCurrentDesktopRuntimeConfig(): DesktopRuntimeConfig | null {
  return currentRuntimeConfig.desktopRuntimeConfig;
}

export async function initializeApiClient(): Promise<void> {
  const desktopRuntimeConfig = await getDesktopRuntimeConfig();
  currentRuntimeConfig = createClientRuntimeConfig(desktopRuntimeConfig);
  apiClient = createConfiguredClient(currentRuntimeConfig);
  rootResource = getRootResource();
}
