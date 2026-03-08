import {
  getCurrentApiBaseUrl,
  getCurrentDesktopRuntimeConfig,
} from './api-client.js';

function resolveApiUrl(href: string): string {
  if (/^https?:\/\//u.test(href)) {
    return href;
  }

  return new URL(href, getCurrentApiBaseUrl()).toString();
}

function applyDesktopHeaders(headers: Headers): Headers {
  const desktopRuntimeConfig = getCurrentDesktopRuntimeConfig();

  if (!desktopRuntimeConfig) {
    return headers;
  }

  headers.set(
    desktopRuntimeConfig.desktopSessionHeader,
    desktopRuntimeConfig.desktopSessionToken,
  );

  return headers;
}

export async function runtimeFetch(
  href: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = applyDesktopHeaders(new Headers(init.headers));

  return await fetch(resolveApiUrl(href), {
    ...init,
    credentials: 'include',
    headers,
  });
}

export function resolveRuntimeApiUrl(href: string): string {
  return resolveApiUrl(href);
}
