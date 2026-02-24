import { Entity } from '../archtype/entity.js';
import {
  GetRequestOptions,
  HeadRequestOptions,
  PatchRequestOptions,
  PostRequestOptions,
  PutRequestOptions,
  RequestOptions,
} from './interface.js';
import { Link, LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { HeadState } from '../state/state.js';
import { needsJsonStringify } from '../util/fetch-body-helper.js';
import { resolve } from '../util/uri.js';
import { HttpMethod } from '../http/util.js';
import { EventEmitter } from 'events';
import { ResourceRelation } from './resource-relation.js';

/**
 * Represents a REST resource with HATEOAS navigation capabilities.
 *
 * Resource is the core class for interacting with HAL-compliant REST APIs.
 * It provides methods for HTTP operations (GET, POST, PUT, PATCH, DELETE),
 * caching, and following HATEOAS links to related resources.
 *
 * @typeParam TEntity - The entity type for this resource
 *
 * @example Basic resource operations
 * ```typescript
 * const client = createClient({ baseURL: 'https://api.example.com' });
 * const userResource = client.go<User>('/users/123');
 *
 * // Fetch resource state
 * const state = await userResource.get();
 * console.log(state.data.name);
 *
 * // Update resource
 * await userResource.patch({ data: { name: 'New Name' } });
 *
 * // Follow HATEOAS links
 * const postsResource = state.follow('posts');
 * const posts = await postsResource.get();
 * ```
 *
 * @example Event handling
 * ```typescript
 * userResource.on('update', (state) => {
 *   console.log('Resource updated:', state.data);
 * });
 *
 * userResource.on('stale', () => {
 *   console.log('Cache invalidated, refetch needed');
 * });
 * ```
 *
 * @see {@link State} for the resource state object
 * @see {@link ResourceRelation} for chained link navigation
 * @see {@link Client} for creating resources via `client.go()`
 *
 * @category Resource
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Resource<TEntity extends Entity> extends EventEmitter {
  private static readonly NO_STALE_HEADER = 'X-RESOURCE-NO-STALE';

  /**
   * Gets the complete URI of the current resource
   * @returns {string} The resolved complete URI
   */
  get uri(): string {
    return resolve(this.link);
  }

  /**
   * Creates a new Resource instance
   * @param client The client instance used for handling requests and caching
   * @param link The link object containing resource relationships and URI templates
   */
  constructor(
    private client: ClientInstance,
    private link: Link,
  ) {
    super();
    this.link.rel = this.link.rel ?? 'items';
  }

  /**
   * This object tracks all in-flight requests.
   *
   * When 2 identical requests are made in quick succession, this object is
   * used to de-duplicate the requests.
   */
  private readonly activeRefresh = new Map<string, Promise<State>>();

  /**
   * Follows a resource relationship based on its rel type
   * @param rel The relationship type, must be a key defined in the entity links
   * @param variables the template variables
   * @returns Returns a new ResourceRelation instance representing the followed relationship
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables,
  ): ResourceRelation<TEntity['links'][K]> {
    return new ResourceRelation(
      this.client,
      this.link,
      [rel as string],
      new Map([[0, { query: variables }]]),
    );
  }

  /**
   * Resolves all resources matching a relation from current state.
   */
  async followAll<K extends keyof TEntity['links']>(
    rel: K,
  ): Promise<Resource<TEntity['links'][K]>[]> {
    const state = await this.get();
    return state.followAll(rel);
  }

  /**
   * Performs an HTTP request on the current resource URI
   * @param init Request initialization options including headers, method, etc.
   * @returns Returns a Promise of the HTTP response
   */
  fetch(init?: RequestInit): Promise<Response> {
    return this.client.fetcher.fetch(this.uri, init);
  }

  /**
   * Performs an HTTP request on the current resource URI and throws an exception on error responses
   * @param init Request initialization options including headers, method, etc.
   * @returns Returns a Promise of the HTTP response
   * @throws Throws an exception when the response status code is 4XX or 5XX
   */
  fetchOrThrow(init?: RequestInit): Promise<Response> {
    return this.client.fetcher.fetchOrThrow(this.uri, init);
  }

  /**
   * Updates the state cache and triggers events
   * Note: This method only updates the local state, not the server-side state
   * @param state The state object to cache
   * @throws Throws an error when the state's URI doesn't match the resource's URI
   */
  updateCache(state: State<TEntity>) {
    if (state.uri !== this.uri) {
      throw new Error(
        'When calling updateCache on a resource, the uri of the State object must match the uri of the Resource',
      );
    }
    this.client.cacheState(state);
  }

  /**
   * Clears the state cache for this resource
   */
  clearCache(): void {
    this.client.clearResourceCache([this.uri], []);
  }

  /**
   * Retrieves the current cached resource state, returns null if unavailable
   * @returns Returns the cached state object or null
   */
  getCache(): State<TEntity> | null {
    return this.client.cache.get(this.uri);
  }

  /**
   * Gets the current state of the resource.
   *
   * Retrieves the resource state, using cached data if available.
   * Implements request deduplication to prevent duplicate concurrent requests.
   *
   * @param requestOptions - Optional request configuration (headers, etc.)
   * @returns A Promise resolving to the resource state
   * @throws Throws `HttpError` when the server returns an error response
   *
   * @example
   * ```typescript
   * const state = await resource.get();
   * console.log(state.data);
   * ```
   */
  async get(requestOptions?: GetRequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit('GET', requestOptions ?? {});

    const state = this.getCache();
    const shouldBypassPartialCache = !!state?.isPartial;

    if (state && !shouldBypassPartialCache) {
      return Promise.resolve(state as State<TEntity>);
    }

    const hash = this.requestHash(this.uri, requestOptions);

    if (!this.activeRefresh.has(hash)) {
      this.activeRefresh.set(
        hash,
        (async (): Promise<State<TEntity>> => {
          try {
            const response = await this.fetchOrThrow(requestInit);

            const state: State<TEntity> = await this.client.getStateForResponse(
              this.link,
              response,
            );
            this.updateCache(state);
            return state;
          } finally {
            this.activeRefresh.delete(hash);
          }
        })(),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.activeRefresh.get(hash)!) as State<TEntity>;
  }

  /**
   * Gets the current state of the resource, always bypassing the cache.
   *
   * This method still deduplicates in-flight requests with identical options.
   */
  async refresh(requestOptions?: GetRequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit('GET', requestOptions ?? {});
    requestInit.cache = 'no-cache';

    const hash = this.requestHash(this.uri, requestOptions);

    if (!this.activeRefresh.has(hash)) {
      this.activeRefresh.set(
        hash,
        (async (): Promise<State<TEntity>> => {
          try {
            const response = await this.fetchOrThrow(requestInit);
            const state: State<TEntity> = await this.client.getStateForResponse(
              this.link,
              response,
            );
            this.updateCache(state);
            return state;
          } finally {
            this.activeRefresh.delete(hash);
          }
        })(),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.activeRefresh.get(hash)!) as State<TEntity>;
  }

  /**
   * Performs a HEAD request and returns link/navigation metadata.
   *
   * If a full cached GET state exists, it is returned directly.
   *
   * @param requestOptions - Optional request headers
   * @returns A Promise resolving to a head state or cached full state
   */
  async head(
    requestOptions?: HeadRequestOptions,
  ): Promise<HeadState<TEntity> | State<TEntity>> {
    const state = this.getCache();
    if (state && !state.isPartial) {
      return state;
    }

    const response = await this.fetchOrThrow(
      this.optionsToRequestInit('HEAD', requestOptions ?? {}),
    );

    return this.client.getHeadStateForResponse(this.link, response);
  }

  /**
   * Sends a PATCH request to update the resource partially.
   *
   * Defaults to `application/json` content-type header.
   * On HTTP 200 response, updates the local cache with the returned state.
   *
   * @param requestOptions - Request options including data payload and headers
   * @returns A Promise resolving to the updated resource state
   * @throws Throws `HttpError` when the server returns an error response
   *
   * @example
   * ```typescript
   * const updated = await resource.patch({
   *   data: { name: 'Updated Name' }
   * });
   * ```
   */
  async patch(requestOptions: PatchRequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit(
      'PATCH',
      requestOptions ?? {},
    );

    const response = await this.client.fetcher.fetchOrThrow(
      this.uri,
      requestInit,
    );

    const state: State<TEntity> = await this.client.getStateForResponse(
      this.link,
      response,
    );

    if (response.status === 200) {
      this.updateCache(state);
    }

    return state as State<TEntity>;
  }

  /**
   * Sends a POST request to the resource.
   *
   * Used for RPC-like endpoints, form submissions, and creating child resources.
   * Supports request deduplication via the `options.dedup` parameter.
   *
   * @param requestOptions - Request options including data payload and headers
   * @param options - Additional options (e.g., `dedup: true` for deduplication)
   * @returns A Promise resolving to the response state
   * @throws Throws `HttpError` When the server returns an error response
   *
   * @see {@link PostRequestOptions} for available request options
   *
   * @example
   * ```typescript
   * // Create a new resource
   * const newPost = await userResource.follow('posts').post({
   *   data: { title: 'Hello', content: 'World' }
   * });
   *
   * // With deduplication (prevents duplicate requests)
   * const result = await resource.post({ data }, { dedup: true });
   * ```
   */
  async post(
    requestOptions: PostRequestOptions,
    options?: { dedup?: boolean },
  ): Promise<State> {
    const requestInit = this.optionsToRequestInit('POST', requestOptions);

    if (options?.dedup) {
      const hash = this.requestHash(this.uri, requestOptions);

      if (!this.activeRefresh.has(hash)) {
        this.activeRefresh.set(
          hash,
          (async (): Promise<State> => {
            try {
              const response = await this.fetchOrThrow(requestInit);
              return this.client.getStateForResponse(this.link, response);
            } finally {
              this.activeRefresh.delete(hash);
            }
          })(),
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return await this.activeRefresh.get(hash)!;
    }

    const response = await this.fetchOrThrow(requestInit);

    return this.client.getStateForResponse(this.link, response);
  }

  /**
   * Sends a POST request and follows to the next resource.
   *
   * If server replies with:
   * - `201` + `Location`: returns the created resource
   * - `204` or `205`: returns current resource
   *
   * @throws Error when status code is not 201/204/205, or 201 misses Location
   */
  async postFollow<TFollowed extends Entity = Entity>(
    requestOptions: PostRequestOptions,
  ): Promise<Resource<TFollowed>> {
    const response = await this.fetchOrThrow(
      this.optionsToRequestInit('POST', requestOptions),
    );

    switch (response.status) {
      case 201:
        if (response.headers.has('location')) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return this.client.go(resolve(this.uri, response.headers.get('location')!));
        }
        throw new Error(
          'Could not follow after a 201 request, because the server did not reply with a Location header. If you sent a Location header, check if your service is returning "Access-Control-Expose-Headers: Location".',
        );
      case 204:
      case 205:
        return this as unknown as Resource<TFollowed>;
      default:
        throw new Error(
          'Did not receive a 201, 204 or 205 status code so we could not follow to the next resource',
        );
    }
  }

  /**
   * Sends a PUT request to replace the resource.
   *
   * Defaults to `application/json` content-type header.
   * On HTTP 200 response, updates the local cache with the returned state.
   *
   * @param requestOptions - Request options including complete data payload and headers
   * @returns A Promise resolving to the replaced resource state
   * @throws Throws `HttpError` When the server returns an error response
   *
   * @example
   * ```typescript
   * const updated = await resource.put({
   *   data: { id: '123', name: 'Complete Data', email: 'user@example.com' }
   * });
   * ```
   */
  async put(requestOptions: PutRequestOptions): Promise<State<TEntity>>;
  async put(requestOptions: State<TEntity>): Promise<State<TEntity>>;
  async put(
    requestOptions: PutRequestOptions | State<TEntity>,
  ): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit('PUT', requestOptions ?? {});

    if (this.isStatePayload(requestOptions)) {
      const headers = new Headers(requestInit.headers);
      headers.set(Resource.NO_STALE_HEADER, '1');
      requestInit.headers = headers;
    }

    const response = await this.client.fetcher.fetchOrThrow(
      this.uri,
      requestInit,
    );

    if (this.isStatePayload(requestOptions)) {
      this.updateCache(requestOptions);
      return requestOptions;
    }

    const state: State<TEntity> = await this.client.getStateForResponse(
      this.link,
      response,
    );

    if (response.status === 200) {
      this.updateCache(state);
    }

    return state as State<TEntity>;
  }

  /**
   * Deletes the resource.
   *
   * Sends an HTTP DELETE request and returns the response state.
   * Triggers the 'delete' event on successful deletion.
   *
   * @returns A Promise resolving to the response state
   * @throws Throws `HttpError` When the server returns an error response
   *
   * @example
   * ```typescript
   * await resource.delete();
   * ```
   */
  async delete(): Promise<State<TEntity>> {
    const response = await this.fetchOrThrow(
      this.optionsToRequestInit('DELETE', {}),
    );

    return this.client.getStateForResponse(this.link, response);
  }

  /**
   * Convert request options to RequestInit
   *
   * RequestInit is passed to the constructor of fetch(). We have our own 'options' format
   */
  private optionsToRequestInit(
    method: HttpMethod,
    options: RequestOptions,
  ): RequestInit {
    let headers;
    if (options.getContentHeaders) {
      headers = new Headers(options.getContentHeaders());
    } else if (options.headers) {
      headers = new Headers(options.headers);
    } else {
      headers = new Headers();
    }

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let body;
    if (options.serializeBody !== undefined) {
      body = options.serializeBody();
    } else if (options.data) {
      body = options.data;
      if (needsJsonStringify(body)) {
        body = JSON.stringify(body);
      }
    }

    const init: RequestInit = { method, headers };

    if (body) {
      init.body = body;
    }

    return init;
  }

  private requestHash(
    uri: string,
    requestOptions: RequestOptions | undefined,
  ): string {
    const headers: Record<string, string> = {};
    if (requestOptions) {
      new Headers(
        requestOptions.getContentHeaders?.() || requestOptions.headers,
      ).forEach((value, key) => {
        headers[key] = value;
      });
    }

    const headerStr = Object.entries(headers)
      .map(([name, value]) => {
        return name.toLowerCase() + ':' + value;
      })
      .join(',');

    let bodyStr = '';
    if (requestOptions?.data) {
      if (typeof requestOptions.data === 'string') {
        bodyStr = requestOptions.data;
      } else if (requestOptions.serializeBody) {
        const serialized = requestOptions.serializeBody();
        bodyStr =
          typeof serialized === 'string' ? serialized : serialized.toString();
      } else {
        bodyStr = JSON.stringify(requestOptions.data);
      }
    }

    return uri + '|' + headerStr + '|' + bodyStr;
  }

  private isStatePayload(
    requestOptions: PutRequestOptions | State<TEntity>,
  ): requestOptions is State<TEntity> {
    return (
      typeof requestOptions === 'object' &&
      requestOptions !== null &&
      'uri' in requestOptions &&
      'serializeBody' in requestOptions &&
      'contentHeaders' in requestOptions
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export declare interface Resource<TEntity extends Entity> {
  /**
   * Subscribe to the 'update' event
   *
   * This event will get triggered whenever a new State is received
   * from the server, either through a GET request or if it was
   * transcluded.
   *
   * It will also trigger when calling 'PUT' with a full state object,
   * and when updateCache() was used.
   *
   * @param event The event name, 'update' in this case
   * @param listener The event listener function that receives the state object as a parameter
   * @returns Returns the current instance for method chaining
   */
  on(event: 'update', listener: (state: State<TEntity>) => void): this;

  /**
   * Subscribe to the 'stale' event
   *
   * This event will get triggered whenever an unsafe method was
   * used, such as POST, PUT, PATCH, etc.
   *
   * When any of these methods are used, the local cache is stale.
   *
   * @param event The event name, 'stale' in this case
   * @param listener The event listener function
   * @returns Returns the current instance for method chaining
   */
  on(event: 'stale', listener: () => void): this;

  /**
   * Subscribe to the 'delete' event
   *
   * This event gets triggered when the `DELETE` http method is used.
   *
   * @param event The event name, 'delete' in this case
   * @param listener The event listener function
   * @returns Returns the current instance for method chaining
   */
  on(event: 'delete', listener: () => void): this;

  /**
   * Subscribe to the 'update' event and unsubscribe after it was emitted the first time
   *
   * @param event The event name, 'update' in this case
   * @param listener The event listener function that receives the state object as a parameter
   * @returns Returns the current instance for method chaining
   */
  once(event: 'update', listener: (state: State<TEntity>) => void): this;

  /**
   * Subscribe to the 'stale' event once, unsubscribing after first trigger.
   *
   * @param event - The event name, 'stale' in this case
   * @param listener - The event listener function
   * @returns The current instance for method chaining
   */
  once(event: 'stale', listener: () => void): this;

  /**
   * Subscribe to the 'delete' event once, unsubscribing after first trigger.
   *
   * @param event - The event name, 'delete' in this case
   * @param listener - The event listener function
   * @returns The current instance for method chaining
   */
  once(event: 'delete', listener: () => void): this;

  /**
   * Unsubscribe from the 'update' event.
   *
   * @param event - The event name, 'update' in this case
   * @param listener - The event listener function to remove
   * @returns The current instance for method chaining
   */
  off(event: 'update', listener: (state: State<TEntity>) => void): this;

  /**
   * Unsubscribe from the 'stale' event.
   *
   * @param event - The event name, 'stale' in this case
   * @param listener - The event listener function to remove
   * @returns The current instance for method chaining
   */
  off(event: 'stale', listener: () => void): this;

  /**
   * Unsubscribe from the 'delete' event.
   *
   * @param event - The event name, 'delete' in this case
   * @param listener - The event listener function to remove
   * @returns The current instance for method chaining
   */
  off(event: 'delete', listener: () => void): this;

  /**
   * Emit the 'update' event.
   *
   * @param event - The event name, 'update' in this case
   * @param state - The state object to pass to listeners
   * @returns Whether any listeners handled the event
   * @internal
   */
  emit(event: 'update', state: State<TEntity>): boolean;

  /**
   * Emit the 'stale' event.
   *
   * @param event - The event name, 'stale' in this case
   * @returns Whether any listeners handled the event
   * @internal
   */
  emit(event: 'stale'): boolean;

  /**
   * Emit the 'delete' event.
   *
   * @param event - The event name, 'delete' in this case
   * @returns Whether any listeners handled the event
   * @internal
   */
  emit(event: 'delete'): boolean;
}

export default Resource;
