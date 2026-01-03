import { Entity } from '../archtype/entity.js';
import {
  GetRequestOptions,
  PatchRequestOptions,
  PostRequestOptions,
  PutRequestOptions,
  RequestOptions,
} from './interface.js';
import { Link, LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Form } from '../form/form.js';
import { SafeAny } from '../archtype/safe-any.js';
import { needsJsonStringify } from '../util/fetch-body-helper.js';
import { resolve } from '../util/uri.js';
import { HttpMethod } from '../http/util.js';
import { EventEmitter } from 'events';
import { ResourceRelation } from './resource-relation.js';
import { BaseState } from '../state/base-state.js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Resource<TEntity extends Entity> extends EventEmitter {
  /**
   * Gets the complete URI of the current resource
   * @returns {string} The resolved complete URI
   */
  get uri(): string {
    return resolve(this.link);
  }

  private method: HttpMethod = 'GET';

  /**
   * Creates a new Resource instance
   * @param client The client instance used for handling requests and caching
   * @param link The link object containing resource relationships and URI templates
   * @param prevUri The URI of the previous resource, used for getting embedded resources
   * @param forms
   */
  constructor(
    private client: ClientInstance,
    private link: Link,
    private prevUri?: string,
    private forms: Form[] = [],
  ) {
    super();
    this.link.rel = this.link.rel ?? 'ROOT_REL';
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
      new Map([[rel as string, { query: variables }]]),
    );
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
   * This function will return a State object.
   */
  private async get(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit(
      this.method,
      requestOptions ?? {},
    );

    const state = this.getCache();

    if (state) {
      return Promise.resolve(state as State<TEntity>);
    }

    const prevState = this.getPrevState();
    const embeddedState = prevState?.getEmbedded(this.link.rel);
    if (embeddedState) {
      this.updateCache(embeddedState);
      return embeddedState;
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
   * Sends a PATCH request to the resource.
   *
   * This function defaults to a application/json content-type header.
   *
   * If the server responds with 200 Status code this will return a State object
   */
  private async patch(requestOptions: RequestOptions): Promise<State<TEntity>> {
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
   * See the documentation for PostRequestOptions for more details.
   * This function is used for RPC-like endpoints and form submissions.
   *
   * This function will return the response as a State object.
   */
  async post(options: PostRequestOptions): Promise<State> {
    const response = await this.fetchOrThrow(
      this.optionsToRequestInit('POST', options),
    );

    return this.client.getStateForResponse(this.link, response);
  }

  /**
   * Sends a PUT request to the resource.
   *
   * This function defaults to a application/json content-type header.
   *
   * If the server responds with 200 Status code this will return a State object
   * and update the cache.
   *
   * @param requestOptions Request options including request body, headers, etc.
   * @returns Returns a Promise of the resource state
   */
  private async put(requestOptions: RequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit('PUT', requestOptions ?? {});

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
   * Deletes the resource
   */
  private async delete(): Promise<State<TEntity>> {
    const response = await this.fetchOrThrow(
      this.optionsToRequestInit('DELETE', {}),
    );

    return this.client.getStateForResponse(this.link, response);
  }

  withGet() {
    return {
      request: (getOptions?: GetRequestOptions) => this.get(getOptions),
    };
  }

  /**
   * Prepare a PATCH request to the resource.
   *
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for PATCH requests
   * - request: Executes the PATCH request with the provided options
   */
  withPatch() {
    return {
      getForm: async () => {
        return this.forms.find((form) => form.method === 'PATCH');
      },
      request: (patchOptions: PatchRequestOptions) => this.patch(patchOptions),
    };
  }

  /**
   * Prepare a POST request to the resource.
   *
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for POST requests
   * - request: Executes the POST request with the provided options
   */
  withPost() {
    return {
      getForm: async () => {
        return this.forms.find((form) => form.method === 'POST');
      },
      request: (postOptions: PostRequestOptions) => this.post(postOptions),
    };
  }

  /**
   * Prepare a PUT request to the resource.
   *
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for PUT requests
   * - request: Executes the PUT request with the provided options
   */
  withPut() {
    return {
      getForm: async () => {
        return this.forms.find((form) => form.method === 'PUT');
      },
      request: (putOptions: PutRequestOptions) => this.put(putOptions),
    };
  }

  withDelete() {
    return {
      request: () => this.delete(),
    };
  }

  /**
   * Gets the form definition associated with the current resource
   * @returns Returns the form object or undefined
   */
  async getForm(): Promise<Form | undefined> {
    const prevState = this.getPrevState();
    return prevState?.getForm(this.link.rel, this.method);
  }

  private getPrevState() {
    return this.prevUri
      ? (this.client.cache.get(this.prevUri) as BaseState<SafeAny>)
      : undefined;
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

    return uri + '|' + headerStr;
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
  on(event: 'update', listener: (state: State) => void): this;

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
  once(event: 'update', listener: (state: State) => void): this;

  /**
   * 订阅 'stale' 事件，并在首次触发后取消订阅
   *
   * @param event 事件名称，此处为 'stale'
   * @param listener 事件监听器函数
   * @returns 返回当前实例，支持链式调用
   */
  once(event: 'stale', listener: () => void): this;

  /**
   * 订阅 'delete' 事件，并在首次触发后取消订阅
   *
   * @param event 事件名称，此处为 'delete'
   * @param listener 事件监听器函数
   * @returns 返回当前实例，支持链式调用
   */
  once(event: 'delete', listener: () => void): this;

  /**
   * 取消订阅 'update' 事件
   *
   * @param event 事件名称，此处为 'update'
   * @param listener 要取消订阅的事件监听器函数
   * @returns 返回当前实例，支持链式调用
   */
  off(event: 'update', listener: (state: State) => void): this;

  /**
   * 取消订阅 'stale' 事件
   *
   * @param event 事件名称，此处为 'stale'
   * @param listener 要取消订阅的事件监听器函数
   * @returns 返回当前实例，支持链式调用
   */
  off(event: 'stale', listener: () => void): this;

  /**
   * 取消订阅 'delete' 事件
   *
   * @param event 事件名称，此处为 'delete'
   * @param listener 要取消订阅的事件监听器函数
   * @returns 返回当前实例，支持链式调用
   */
  off(event: 'delete', listener: () => void): this;

  /**
   * 触发 'update' 事件
   *
   * @param event 事件名称，此处为 'update'
   * @param state 要传递给监听器的状态对象
   * @returns 返回事件是否被处理
   */
  emit(event: 'update', state: State): boolean;

  /**
   * 触发 'stale' 事件
   *
   * @param event 事件名称，此处为 'stale'
   * @returns 返回事件是否被处理
   */
  emit(event: 'stale'): boolean;

  /**
   * 触发 'delete' 事件
   *
   * @param event 事件名称，此处为 'delete'
   * @returns 返回事件是否被处理
   */
  emit(event: 'delete'): boolean;
}

export default Resource;
