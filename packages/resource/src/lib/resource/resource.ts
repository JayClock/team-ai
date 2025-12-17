import { Entity } from '../archtype/entity.js';
import { RequestOptions } from './interface.js';
import { LinkVariables } from '../links/link.js';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Form } from '../form/form.js';
import { SafeAny } from '../archtype/safe-any.js';
import { z } from 'zod';
import { needsJsonStringify } from '../util/fetch-body-helper.js';
import { resolve } from '../util/uri.js';
import { expand } from '../util/uri-template.js';
import { HttpMethod } from '../http/util.js';
import EventEmitter from 'events';
import { ResourceRelation } from './resource-relation.js';
import { BaseState } from '../state/base-state.js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Resource<TEntity extends Entity> extends EventEmitter {
  get uri() {
    return resolve(this.expandedLink());
  }

  private method: HttpMethod = 'GET';
  private variables: LinkVariables = {};

  constructor(
    private client: ClientInstance,
    private link: Link,
    private prevUri?: string,
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
   * Follows a relationship, based on its rel type.
   *
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): ResourceRelation<TEntity['links'][K]> {
    return new ResourceRelation(this.client, this.link, [rel as string]);
  }

  /**
   * Does a HTTP request on the current resource URI
   */
  fetch(init?: RequestInit): Promise<Response> {
    return this.client.fetcher.fetch(this.uri, init);
  }

  /**
   * Does a HTTP request on the current resource URI.
   *
   * If the response was a 4XX or 5XX, this function will throw
   * an exception.
   */
  fetchOrThrow(init?: RequestInit): Promise<Response> {
    return this.client.fetcher.fetchOrThrow(this.uri, init);
  }

  /**
   * Updates the state cache, and emits events.
   *
   * This will update the local state but *not* update the server
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
   * Clears the state cache for this resource.
   */
  clearCache(): void {
    this.client.clearResourceCache([this.uri], []);
  }

  /**
   * Retrieves the current cached resource state, and return `null` if it's
   * not available.
   */
  getCache(): State<TEntity> | null {
    return this.client.cache.get(this.uri);
  }

  async request(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const prevState = this.prevUri
      ? (this.client.cache.get(this.prevUri) as BaseState<SafeAny>)
      : undefined;
    const form = prevState?.getForm(this.link.rel, this.method);

    if (form) {
      this.verifyFormData(form, requestOptions?.data);
    }
    const requestInit = this.optionsToRequestInit(requestOptions ?? {});

    switch (this.method) {
      case 'GET':
        return await this.get(requestOptions);
      case 'PATCH':
        return await this.patch(requestOptions ?? {});
    }
    const response = await this.fetchOrThrow(requestInit);

    return this.client.getStateForResponse(this.expandedLink(), response);
  }

  /**
   * Gets the current state of the resource.
   *
   * This function will return a State object.
   */
  private async get(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const requestInit = this.optionsToRequestInit(requestOptions ?? {});

    const state = this.getCache();

    if (state) {
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
              this.expandedLink(),
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
    const requestInit = this.optionsToRequestInit(requestOptions ?? {});

    const response = await this.client.fetcher.fetchOrThrow(
      this.uri,
      requestInit,
    );

    const state: State<TEntity> = await this.client.getStateForResponse(
      this.expandedLink(),
      response,
    );

    if (response.status === 200) {
      this.updateCache(state);
    }

    return state as State<TEntity>;
  }

  withTemplateParameters(variables: LinkVariables): Resource<TEntity> {
    this.variables = variables;
    return this;
  }

  withMethod(method: HttpMethod): Resource<TEntity> {
    this.method = method;
    return this;
  }

  private expandedLink(): Link {
    return {
      ...this.link,
      href: expand(this.link, this.variables),
    };
  }

  private verifyFormData(form: Form, body: Record<string, SafeAny> = {}) {
    const shape: Record<string, SafeAny> = {};

    for (const field of form.fields) {
      let shapeElement: z.ZodType;

      switch (field.type) {
        case 'text':
          shapeElement = z.string();
          break;
        case 'url':
          shapeElement = z.url();
          break;
        default:
          shapeElement = z.string();
      }

      if (field.readOnly) {
        shapeElement = shapeElement.readonly();
      }
      if (!field.required) {
        shapeElement = shapeElement.optional();
      }
      shape[field.name] = shapeElement;
    }

    try {
      const schema = z.object(shape);
      schema.parse(body);
    } catch {
      throw new Error('Invalid');
    }
  }

  /**
   * Convert request options to RequestInit
   *
   * RequestInit is passed to the constructor of fetch(). We have our own 'options' format
   */
  private optionsToRequestInit(options: RequestOptions): RequestInit {
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

    const init: RequestInit = { method: this.method, headers };

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

export default Resource;
