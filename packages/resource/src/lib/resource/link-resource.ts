import { Entity } from '../archtype/entity.js';
import { GetRequestOptions, Resource, ResourceOptions } from './resource.js';
import { StateResource } from './state-resource.js';
import { BaseResource } from './base-resource.js';
import { Link, LinkVariables, NewLink } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Form } from '../form/form.js';
import { SafeAny } from '../archtype/safe-any.js';
import { z } from 'zod';
import { needsJsonStringify } from '../util/fetch-body-helper.js';
import { resolve } from '../util/uri.js';
import { expand } from '../util/uri-template.js';

export class LinkResource<
  TEntity extends Entity
> extends BaseResource<TEntity> {
  constructor(
    client: ClientInstance,
    private readonly link: NewLink,
    private readonly rels: string[] = [],
    optionsMap: Map<string, ResourceOptions> = new Map()
  ) {
    super(client, optionsMap);
    this.link.rel = this.link.rel ?? 'ROOT_REL';
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
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]> {
    this.initRequestOptionsWithRel(rel as string, { query: variables });
    return new LinkResource(
      this.client,
      this.link,
      this.rels.concat(rel as string),
      this.optionsMap
    );
  }

  getCurrentOptions() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.isRootResource() ? this.link.rel : this.rels.at(-1)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentOptions = this.optionsMap.get(rel)!;
    return { rel, currentOptions };
  }

  async request(form?: Form): Promise<State<TEntity>> {
    const link = {
      ...this.link,
      context: this.client.bookmarkUri,
    };
    const state: State<TEntity> = await this.httpRequest(link, form);
    if (this.isRootResource()) {
      this.client.cacheState(state);
      return state;
    }
    const stateResource = new StateResource<TEntity>(
      this.client,
      state,
      this.rels,
      this.optionsMap
    );
    return stateResource.request();
  }

  private isRootResource() {
    return this.rels.length === 0;
  }

  private async httpRequest(link: Link, form?: Form): Promise<State<TEntity>> {
    const options = this.getRequestOption(link);

    if (form) {
      this.verifyFormData(form, options.data);
    }

    const url = resolve(link.context, expand(link, options.query));
    const requestInit = optionsToRequestInit(options);

    if (options.method === 'GET') {
      const state = this.client.cache.get(url);
      if (state) {
        return Promise.resolve(state as State<TEntity>);
      }

      const hash = requestHash(url, options);

      if (!this.activeRefresh.has(hash)) {
        this.activeRefresh.set(
          hash,
          (async (): Promise<State> => {
            try {
              const response = await this.client.fetcher.fetchOrThrow(
                url,
                requestInit
              );
              const state = await this.client.getStateForResponse(
                response.url,
                response,
                link.rel
              );
              this.client.cacheState(state);
              return state;
            } finally {
              this.activeRefresh.delete(hash);
            }
          })()
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return await this.activeRefresh.get(hash)!;
    }

    const response = await this.client.fetcher.fetchOrThrow(url, requestInit);

    return this.client.getStateForResponse(response.url, response, link.rel);
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

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }
}

/**
 * Convert request options to RequestInit
 *
 * RequestInit is passed to the constructor of fetch(). We have our own 'options' format
 */
function optionsToRequestInit(options: ResourceOptions): RequestInit {
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

  const init: RequestInit = { method: options.method, headers };

  if (body) {
    init.body = body;
  }

  return init;
}

function requestHash(
  uri: string,
  options: GetRequestOptions | undefined
): string {
  const headers: Record<string, string> = {};
  if (options) {
    new Headers(options.getContentHeaders?.() || options.headers).forEach(
      (value, key) => {
        headers[key] = value;
      }
    );
  }

  const headerStr = Object.entries(headers)
    .map(([name, value]) => {
      return name.toLowerCase() + ':' + value;
    })
    .join(',');

  return uri + '|' + headerStr;
}
