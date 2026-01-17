import { SafeAny } from '../archtype/safe-any.js';

/**
 * HTTP headers as a key-value record.
 *
 * @category Resource
 */
export type HttpHeaders = Record<string, string>;

/**
 * Configuration options for HTTP requests.
 *
 * RequestOptions provides flexible ways to specify request body and headers
 * for Resource HTTP methods (GET, POST, PUT, PATCH, DELETE).
 *
 * @typeParam T - The type of the data payload
 *
 * @example
 * ```typescript
 * // Simple JSON data
 * await resource.post({ data: { name: 'John' } });
 *
 * // Custom serialization
 * await resource.post({
 *   serializeBody: () => customSerialize(data),
 *   getContentHeaders: () => ({ 'Content-Type': 'application/xml' })
 * });
 * ```
 *
 * @category Resource
 */
export type RequestOptions<T = SafeAny> = {
  /**
   * Custom body serialization function.
   *
   * When provided, this function is called to serialize the request body.
   * Takes precedence over the `data` property.
   *
   * @returns Serialized body as string, Buffer, or Blob
   */
  serializeBody?: () => string | Buffer | Blob;

  /**
   * The request body data.
   *
   * If not a string or Buffer, the data will be JSON-encoded automatically.
   * Ignored if `serializeBody` is provided.
   */
  data?: T;

  /**
   * Function returning content-related headers.
   *
   * Takes precedence over the `headers` property.
   *
   * @returns Headers as HttpHeaders record or Headers object
   */
  getContentHeaders?: () => HttpHeaders | Headers;

  /**
   * HTTP headers for the request.
   *
   * Used as fallback when `getContentHeaders` is not provided.
   */
  headers?: HttpHeaders | Headers;
};

/**
 * Request options for GET requests (no body allowed).
 *
 * @category Resource
 */
export type GetRequestOptions = Omit<RequestOptions, 'serializeBody' | 'data'>;

/**
 * Request options for PATCH requests.
 *
 * @typeParam T - The type of the data payload
 * @category Resource
 */
export type PatchRequestOptions<T = SafeAny> = RequestOptions<T>;

/**
 * Request options for PUT requests.
 *
 * @typeParam T - The type of the data payload
 * @category Resource
 */
export type PutRequestOptions<T = SafeAny> = RequestOptions<T>;

/**
 * Request options for POST requests.
 *
 * @typeParam T - The type of the data payload
 * @category Resource
 */
export type PostRequestOptions<T = SafeAny> = RequestOptions<T>;
