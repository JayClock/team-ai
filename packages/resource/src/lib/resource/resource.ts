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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Resource<TEntity extends Entity> extends EventEmitter {
  readonly uri: string;
  private method: HttpMethod = 'GET';
  private variables: LinkVariables = {};

  constructor(
    private readonly client: ClientInstance,
    private readonly link: Link,
  ) {
    super();
    this.link.rel = this.link.rel ?? 'ROOT_REL';
    this.uri = resolve(client.bookmarkUri, link.href);
  }

  /**
   * This object tracks all in-flight requests.
   *
   * When 2 identical requests are made in quick succession, this object is
   * used to de-duplicate the requests.
   */
  private readonly activeRefresh = new Map<string, Promise<State>>();

  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): ResourceRelation<TEntity['links'][K]> {
    return new ResourceRelation(this.client, this.link, [rel as string]);
  }

  async request(
    requestOptions?: RequestOptions,
    form?: Form,
  ): Promise<State<TEntity>> {
    if (form) {
      this.verifyFormData(form, requestOptions?.data);
    }
    const { url, requestInit } = this.parseFetchParameters(requestOptions);

    switch (this.method) {
      case 'GET':
        return await this.get(requestOptions);
      case 'PATCH':
        return await this.patch(requestOptions ?? {});
    }
    const response = await this.client.fetcher.fetchOrThrow(url, requestInit);

    return this.client.getStateForResponse(
      response.url,
      response,
      this.link.rel,
    );
  }

  private parseFetchParameters(
    requestOptions: RequestOptions<SafeAny> | undefined,
  ) {
    const url = resolve(this.link.context, expand(this.link, this.variables));
    const requestInit = this.optionsToRequestInit(requestOptions ?? {});
    return { url, requestInit };
  }

  /**
   * Gets the current state of the resource.
   *
   * This function will return a State object.
   */
  private async get(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const { url, requestInit } = this.parseFetchParameters(requestOptions);

    const state = this.client.cache.get(url);

    if (state) {
      return Promise.resolve(state as State<TEntity>);
    }

    const hash = this.requestHash(url, requestOptions);

    if (!this.activeRefresh.has(hash)) {
      this.activeRefresh.set(
        hash,
        (async (): Promise<State> => {
          try {
            const response = await this.client.fetcher.fetchOrThrow(
              url,
              requestInit,
            );
            const state = await this.client.getStateForResponse(
              response.url,
              response,
              this.link.rel,
            );
            this.client.cacheState(state);
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
    const { url, requestInit } = this.parseFetchParameters(requestOptions);

    const response = await this.client.fetcher.fetchOrThrow(url, requestInit);

    const state = await this.client.getStateForResponse(
      response.url,
      response,
      this.link.rel,
    );

    if (response.status === 200) {
      this.client.cacheState(state);
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
