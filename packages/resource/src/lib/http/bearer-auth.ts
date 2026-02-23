import type { FetchMiddleware } from './fetcher.js';

/**
 * Creates a Bearer token auth middleware.
 */
export const bearerAuth = (token: string): FetchMiddleware => {
  const header = `Bearer ${token}`;

  return async (request, next) => {
    request.headers.set('Authorization', header);
    return next(request);
  };
};

export default bearerAuth;
