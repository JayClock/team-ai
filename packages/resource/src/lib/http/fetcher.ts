import problemFactory from './error.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';
import type { Config } from '../archtype/config.js';

/**
 * Middleware function for intercepting and modifying HTTP requests/responses.
 *
 * Middlewares form a chain where each can modify the request before passing
 * to the next, and modify the response after receiving it.
 *
 * @param request - The outgoing Request object
 * @param next - Function to pass control to the next middleware
 * @returns A Promise resolving to the Response
 *
 * @example
 * ```typescript
 * const authMiddleware: FetchMiddleware = async (request, next) => {
 *   request.headers.set('Authorization', `Bearer ${token}`);
 *   const response = await next(request);
 *   // Optionally transform response
 *   return response;
 * };
 * ```
 *
 * @category Middleware
 */
export type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>,
) => Promise<Response>;

/**
 * HTTP fetcher with middleware support.
 *
 * Wraps the native `fetch()` API and provides a middleware chain for
 * request/response interception. Used internally by the HATEOAS client.
 *
 * @internal
 * @category Middleware
 */
@injectable()
export class Fetcher {
  /**
   * Registered middlewares as [pattern, middleware] pairs.
   */
  middlewares: [RegExp, FetchMiddleware][] = [];

  constructor(@inject(TYPES.Config) private config: Config) {}

  /**
   * Performs an HTTP request with middleware processing.
   *
   * Middlewares are executed in registration order. The final middleware
   * performs the actual `fetch()` call.
   *
   * @param resource - URL string or Request object
   * @param init - Optional request initialization options
   * @returns A Promise resolving to the Response
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/fetch | MDN fetch() documentation}
   */
  fetch(resource: string | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(resource, init);

    const origin = new URL(request.url).origin;
    const mws = this.getMiddlewaresByOrigin(origin);
    mws.push((innerRequest: Request) => {
      if (
        !innerRequest.headers.has('User-Agent') &&
        this.config.sendUserAgent
      ) {
        innerRequest.headers.set(
          'User-Agent',
          'Resource/' + require('../../../package.json').version,
        );
      }

      return fetch(innerRequest);
    });

    return invokeMiddlewares(mws, request);
  }

  /**
   * Returns middlewares matching a specific origin.
   *
   * @param origin - The request origin (e.g., 'https://api.example.com')
   * @returns Array of matching middleware functions
   */
  getMiddlewaresByOrigin(origin: string): FetchMiddleware[] {
    return this.middlewares
      .filter(([regex]) => {
        return regex.test(origin);
      })
      .map(([, middleware]) => {
        return middleware;
      });
  }

  /**
   * Registers a middleware for request/response interception.
   *
   * @param mw - The middleware function
   * @param origin - Origin pattern to match. Use '*' for all origins (default)
   *                 Supports wildcards (e.g., 'https://*.example.com')
   */
  use(mw: FetchMiddleware, origin = '*'): void {
    const matchSplit = origin.split('*');
    const matchRegex = matchSplit
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('(.*)');

    const regex = new RegExp('^' + matchRegex + '$');
    this.middlewares.push([regex, mw]);
  }

  /**
   * Performs an HTTP request and throws on error responses.
   *
   * Similar to `fetch()`, but throws an exception if the response
   * status indicates an error (4xx or 5xx).
   *
   * @param resource - URL string or Request object
   * @param init - Optional request initialization options
   * @returns A Promise resolving to a successful Response
   * @throws {@link HttpError} When the response status is 4xx or 5xx
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Request | MDN Request documentation}
   */
  async fetchOrThrow(
    resource: string | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await this.fetch(resource, init);

    if (response.ok) {
      return response;
    } else {
      throw await problemFactory(response);
    }
  }
}

function invokeMiddlewares(
  mws: FetchMiddleware[],
  request: Request,
): Promise<Response> {
  return mws[0](request, (nextRequest: Request) => {
    return invokeMiddlewares(mws.slice(1), nextRequest);
  });
}
