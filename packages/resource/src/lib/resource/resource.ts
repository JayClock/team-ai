import { Entity } from '../archtype/entity.js';
import { SafeAny } from '../archtype/safe-any.js';
import { State } from '../state/state.js';
import { LinkVariables } from '../links/link.js';
import { HttpMethod } from '../http/util.js';

export type HttpHeaders = Record<string, string>;

/**
 * RequestOptions is a set of properties that define
 * a request, or state change.
 *
 * Everything is usually optional.
 */
export type RequestOptions<T = SafeAny> = {
  /**
   * Should return a string or a Buffer.
   *
   * Will be used as the body in the HTTP request.
   * If not set, `body` will be used instead.
   */
  serializeBody?: () => string | Buffer | Blob;

  /**
   * If set, contains the body of the current state.
   *
   * If body is not a `string` or a `Buffer`, the body will
   * be JSON encoded.
   */
  data?: T;

  /**
   * List of headers that will be set in the request.
   *
   * If this is not set, we'll fall back to 'headers'
   */
  getContentHeaders?: () => HttpHeaders | Headers;

  /**
   * Full list of HTTP headers.
   */
  headers?: HttpHeaders | Headers;
};

export interface ResourceOptions extends RequestOptions {
  query?: Record<string, SafeAny>;
  body?: Record<string, SafeAny>;
  method?: HttpMethod;
}

export interface Resource<TEntity extends Entity> {
  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>;

  withTemplateParameters(variables: LinkVariables): Resource<TEntity>;

  request(requestOptions?: RequestOptions): Promise<State<TEntity>>;

  withMethod(method: HttpMethod): Resource<TEntity>;
}
