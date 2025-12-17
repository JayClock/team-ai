import { ClientInstance } from '../client-instance.js';
import { FetchMiddleware } from '../http/fetcher.js';
import LinkHeader from 'http-link-header';
import { resolve } from '../util/uri.js';
import { isSafeMethod } from '../http/util.js';

/**
 * This middleware manages the cache based on information in requests
 * and responses.
 *
 * It expires items from the cache and updates the cache if `Content-Location`
 * appeared in the response.
 *
 * It's also responsible for emitting 'stale' events.
 */
export function cacheMiddleware(client: ClientInstance): FetchMiddleware {
  return async (request, next) => {
    const response = await next(request);

    if (isSafeMethod(request.method)) {
      return response;
    }

    if (!response.ok) {
      // There was an error, no cache changes
      return response;
    }

    // We just processed an unsafe method, lets notify all subsystems.
    const stale = [];
    const deleted = [];

    if (request.method === 'DELETE') {
      deleted.push(request.url);
    }

    // If the response had a Link: rel=invalidate header, we want to
    // expire those
    if (response.headers.has('Link')) {
      for (const httpLink of LinkHeader.parse(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        response.headers.get('Link')!,
      ).rel('invalidates')) {
        const uri = resolve(request.url, httpLink.uri);
        stale.push(uri);
      }
    }

    // Location headers should also expire
    if (response.headers.has('Location')) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      stale.push(resolve(request.url, response.headers.get('Location')!));
    }

    client.clearResourceCache(stale, deleted);

    // If the response had a 'Content-Location' header, it means that the
    // response body is the _new_ state for the url in the content-location
    // header, so we store it!
    if (
      request.cache !== 'no-store' &&
      response.headers.has('Content-Location')
    ) {
      const clState = await client.getStateForResponse(
        {
          rel: '',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          href: response.headers.get('Content-Location')!,
          context: request.url,
        },
        response.clone(),
      );
      client.cacheState(clState);
    }

    return response;
  };
}
