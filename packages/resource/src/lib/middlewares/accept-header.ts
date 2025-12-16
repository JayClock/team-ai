import { FetchMiddleware } from '../http/fetcher.js';
import { ClientInstance } from '../client-instance.js';

/**
 * This middleware injects a default Accept header.
 *
 * The list of content-types is generated from the Client's
 * 'contentTypeMap'.
 */
export function acceptMiddleware(client: ClientInstance): FetchMiddleware {
  return async (request, next) => {
    if (!request.headers.has('Accept')) {
      const acceptHeader = Object.entries(client.contentTypeMap)
        .map(([contentType, [, q]]) => contentType + ';q=' + q)
        .join(', ');
      request.headers.set('Accept', acceptHeader);
    }
    return next(request);
  };
}
