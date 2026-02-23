import type { FetchMiddleware } from './fetcher.js';

/**
 * Creates a Basic Auth middleware.
 */
export const basicAuth = (
  userName: string,
  password: string,
): FetchMiddleware => {
  const encoded = Buffer.from(`${userName}:${password}`).toString('base64');
  const header = `Basic ${encoded}`;

  return async (request, next) => {
    request.headers.set('Authorization', header);
    return next(request);
  };
};

export default basicAuth;
