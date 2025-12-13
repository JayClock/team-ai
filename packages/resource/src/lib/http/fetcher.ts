import problemFactory from './error.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';
import type { Config } from '../archtype/config.js';

export type FetchMiddleware = (
  request: Request,
  next: (request: Request) => Promise<Response>,
) => Promise<Response>;

/**
 * The fetcher object is responsible for calling fetch()
 *
 * This is wrapped in an object because we want to support
 * 'fetch middlewares'. These middlewares are similar to server-side
 * middlewares and can intercept requests and alter requests/responses.
 */
@injectable()
export class Fetcher {
  middlewares: [RegExp, FetchMiddleware][] = [];

  constructor(@inject(TYPES.Config) private config: Config) {}

  /**
   * A wrapper for MDN fetch()
   *
   * This wrapper supports 'fetch middlewares'. It will call them
   * in sequence.
   */
  private fetch(
    resource: string | Request,
    init?: RequestInit,
  ): Promise<Response> {
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
   * Returns the list of middlewares that are applicable to
   * a specific origin
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
   * Add a middleware
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
   * Does a HTTP request and throws an exception if the server emitted
   * a HTTP error.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/Request
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
