import { Entity } from '../archtype/entity.js';
import { SafeAny } from '../archtype/safe-any.js';
import { State } from '../state/state.js';
import { LinkVariables } from '../links/link.js';
import { HttpMethod } from '../http/util.js';
import EventEmitter from 'events';

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

export interface Resource<TEntity extends Entity> extends EventEmitter {
  /**
   * the inlet uri of resource
   */
  rootUri: string;

  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>;

  withTemplateParameters(variables: LinkVariables): Resource<TEntity>;

  request(requestOptions?: RequestOptions): Promise<State<TEntity>>;

  withMethod(method: HttpMethod): Resource<TEntity>;

  isRootResource(): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export declare interface Resource<TEntity extends Entity> {
  /**
   * Subscribe to the 'update' event.
   *
   * This event will get triggered whenever a new State is received
   * from the server, either through a GET request or if it was
   * transcluded.
   *
   * It will also trigger when calling 'PUT' with a full state object,
   * and when updateCache() was used.
   */
  on(event: 'update', listener: (state: State) => void): this;

  /**
   * Subscribe to the 'stale' event.
   *
   * This event will get triggered whenever an unsafe method was
   * used, such as POST, PUT, PATCH, etc.
   *
   * When any of these methods are used, the local cache is stale.
   */
  on(event: 'stale', listener: () => void): this;

  /**
   * Subscribe to the 'delete' event.
   *
   * This event gets triggered when the `DELETE` http method is used.
   */
  on(event: 'delete', listener: () => void): this;

  /**
   * Subscribe to the 'update' event and unsubscribe after it was
   * emitted the first time.
   */
  once(event: 'update', listener: (state: State) => void): this;

  /**
   * Subscribe to the 'stale' event and unsubscribe after it was
   * emitted the first time.
   */
  once(event: 'stale', listener: () => void): this;

  /**
   * Subscribe to the 'delete' event and unsubscribe after it was
   * emitted the first time.
   */
  once(event: 'delete', listener: () => void): this;

  /**
   * Unsubscribe from the 'update' event
   */
  off(event: 'update', listener: (state: State) => void): this;

  /**
   * Unsubscribe from the 'stale' event
   */
  off(event: 'stale', listener: () => void): this;

  /**
   * Unsubscribe from the 'delete' event
   */
  off(event: 'delete', listener: () => void): this;

  /**
   * Emit an 'update' event.
   */
  emit(event: 'update', state: State): boolean;

  /**
   * Emit a 'stale' event.
   */
  emit(event: 'stale'): boolean;

  /**
   * Emit a 'delete' event.
   */
  emit(event: 'delete'): boolean;
}
