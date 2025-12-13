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

export type GetRequestOptions = Omit<RequestOptions, 'serializeBody' | 'data'>;
export type HeadRequestOptions = GetRequestOptions;
export type PatchRequestOptions<T = SafeAny> = RequestOptions<T>;
export type PutRequestOptions<T = SafeAny> = RequestOptions<T>;
export type PostRequestOptions<T = SafeAny> = RequestOptions<T>;

export interface ResourceOptions extends RequestOptions {
  query?: Record<string, SafeAny>;
  body?: Record<string, SafeAny>;
  method?: HttpMethod;
}

export type GetResource<TEntity extends Entity> = Pick<
  Resource<TEntity>,
  'follow' | 'request'
>;

export type PostResource<TEntity extends Entity> = Pick<
  Resource<TEntity>,
  'follow' | 'request'
>;

export type PutResource<TEntity extends Entity> = Pick<
  Resource<TEntity>,
  'follow' | 'request'
>;

export type PatchResource<TEntity extends Entity> = Pick<
  Resource<TEntity>,
  'follow' | 'request'
>;

export type DeleteResource<TEntity extends Entity> = Pick<
  Resource<TEntity>,
  'follow' | 'request'
>;

export interface Resource<TEntity extends Entity> {
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]>;

  request(): Promise<State<TEntity>>;

  withGet(options?: GetRequestOptions): GetResource<TEntity>;

  withPost(options: PostRequestOptions): PostResource<TEntity>;

  withPut(options: PutRequestOptions): PutResource<TEntity>;

  withPatch(options: PatchRequestOptions): PatchResource<TEntity>;

  withDelete(): DeleteResource<TEntity>;
}
