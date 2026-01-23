import { ClientInstance } from '../client-instance.js';
import { Link, LinkVariables } from '../links/link.js';
import {
  GetRequestOptions,
  PatchRequestOptions,
  PostRequestOptions,
  PutRequestOptions,
  RequestOptions,
} from './interface.js';
import { Entity } from '../archtype/entity.js';
import { HttpMethod } from '../http/util.js';
import { State } from '../state/state.js';
import Resource from './resource.js';
import { SafeAny } from '../archtype/safe-any.js';
import { Form } from '../form/form.js';
import { BaseState } from '../state/base-state.js';

/**
 * @internal
 */
interface ResourceOptions {
  query?: Record<string, SafeAny>;
  method?: HttpMethod;
}

/**
 * Represents a deferred resource relationship for chained HATEOAS navigation.
 *
 * ResourceRelation enables lazy, chainable navigation through HATEOAS links
 * without immediately fetching intermediate resources. This is useful for
 * building navigation paths that can be executed as a single operation.
 *
 * @typeParam TEntity - The entity type of the target resource
 *
 * @example Chained navigation
 * ```typescript
 * // Navigate through multiple links
 * const comments = await client.go<User>('/users/123')
 *   .follow('posts')
 *   .follow('items')
 *   .follow('comments')
 *   .get();
 *
 * // With template variables at each step
 * const result = await resource
 *   .follow('search', { q: 'hello' })
 *   .follow('items')
 *   .get();
 * ```
 *
 * @see {@link Resource} for direct resource operations
 * @see {@link Resource.follow} for creating ResourceRelation instances
 *
 * @category Resource
 */
export class ResourceRelation<TEntity extends Entity> {
  /**
   * Creates a new ResourceRelation instance.
   *
   * @param client - The client instance for handling requests and caching
   * @param link - The root link object for URI resolution
   * @param rels - The relationship path array from root to target
   * @param optionsMap - Configuration options for each relationship step
   * @internal
   */
  constructor(
    private readonly client: ClientInstance,
    private readonly link: Link,
    private readonly rels: string[],
    private readonly optionsMap: Map<string, ResourceOptions> = new Map(),
  ) {}

  /**
   * Executes a resource request to get the resource state
   * @param requestOptions Request options including request body, headers, etc.
   * @returns Returns a Promise of the resource state
   */
  private async request(
    requestOptions?: RequestOptions,
  ): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.get(requestOptions);
  }

  /**
   * Gets the resource instance
   * @returns Returns a Promise of the resource instance
   */
  async getResource(): Promise<Resource<TEntity>> {
    return this.getResourceWithRels(this.rels);
  }

  /**
   * Gets the form definition associated with the current resource
   * @returns Returns the form object or undefined
   * @deprecated use state.action()
   */
  private async getForm(): Promise<Form | undefined> {
    const prevResource = await this.getResourceWithRels(this.rels.slice(0, -1));
    const { currentOptions } = this.getCurrentOptions();
    const prevState = (await prevResource.get()) as BaseState<TEntity>;
    return prevState.getForm(this.link.rel, currentOptions.method);
  }

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
    const newOptionsMap = new Map(this.optionsMap);
    newOptionsMap.set(rel as string, { query: variables });
    return new ResourceRelation(
      this.client,
      this.link,
      this.rels.concat(rel as string),
      newOptionsMap,
    );
  }

  /**
   * Fetches the target resource state.
   *
   * Resolves all intermediate relationships and performs GET on the target.
   *
   * @param requestOptions - Optional request configuration
   * @returns A Promise resolving to the target resource state
   * @throws Throws `HttpError` When any request in the chain fails
   */
  async get(requestOptions?: GetRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.get(requestOptions);
  }

  /**
   * Sends a PATCH request to the target resource.
   *
   * Resolves all intermediate relationships and performs PATCH on the target.
   * Defaults to `application/json` content-type.
   *
   * @param requestOptions - Request options including data payload and headers
   * @returns A Promise resolving to the updated resource state
   * @throws Throws `HttpError` When any request in the chain fails
   */
  async patch(requestOptions: PatchRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.patch(requestOptions);
  }

  /**
   * Sends a POST request to the target resource.
   *
   * Resolves all intermediate relationships and performs POST on the target.
   * Supports request deduplication via `postOptions.dedup`.
   *
   * @param options - Request options including data payload and headers
   * @param postOptions - Additional options (e.g., `dedup: true`)
   * @returns A Promise resolving to the response state
   * @throws Throws `HttpError` When any request in the chain fails
   */
  async post(
    options: PostRequestOptions,
    postOptions?: { dedup?: boolean },
  ): Promise<State> {
    const resource = await this.getResource();
    return resource.post(options, postOptions);
  }

  /**
   * Sends a PUT request to the target resource.
   *
   * Resolves all intermediate relationships and performs PUT on the target.
   * Defaults to `application/json` content-type.
   *
   * @param requestOptions - Request options including complete data payload
   * @returns A Promise resolving to the replaced resource state
   * @throws Throws `HttpError` When any request in the chain fails
   */
  async put(requestOptions: PutRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.put(requestOptions);
  }

  /**
   * Deletes the target resource.
   *
   * Resolves all intermediate relationships and performs DELETE on the target.
   *
   * @returns A Promise resolving to the response state
   * @throws Throws `HttpError` When any request in the chain fails
   */
  async delete(): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.delete();
  }

  /**
   * Prepares a GET request to the resource.
   *
   * @deprecated use get()
   * @returns Returns an object with a request method
   * - request: Executes the GET request with optional options
   */
  withGet() {
    return {
      request: (getOptions?: RequestOptions) => this.request(getOptions),
    };
  }

  /**
   * Prepares a PATCH request to the resource.
   *
   * @deprecated use patch()
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for PATCH requests
   * - request: Executes the PATCH request with the provided options
   */
  withPatch() {
    return {
      getForm: async () => {
        return this.getForm();
      },
      request: (patchOptions: RequestOptions) => {
        const { rel } = this.getCurrentOptions();
        this.optionsMap.set(rel, { query: undefined, method: 'PATCH' });
        return this.request(patchOptions);
      },
    };
  }

  /**
   * Prepares a POST request to the resource.
   *
   * @deprecated use post()
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for POST requests
   * - request: Executes the POST request with the provided options
   */
  withPost() {
    return {
      getForm: async () => {
        return this.getForm();
      },
      request: (postOptions: RequestOptions) => {
        const { rel } = this.getCurrentOptions();
        this.optionsMap.set(rel, { query: undefined, method: 'POST' });
        return this.request(postOptions);
      },
    };
  }

  /**
   * Prepares a PUT request to the resource.
   *
   * @deprecated use put()
   * @returns Returns an object with getForm and request methods
   * - getForm: Gets the form definition for PUT requests
   * - request: Executes the PUT request with the provided options
   */
  withPut() {
    return {
      getForm: async () => {
        return this.getForm();
      },
      request: (putOptions: RequestOptions) => {
        const { rel } = this.getCurrentOptions();
        this.optionsMap.set(rel, { query: undefined, method: 'PUT' });
        return this.request(putOptions);
      },
    };
  }

  /**
   * Prepares a DELETE request to the resource.
   *
   * @deprecated use delete()
   * @returns Returns an object with a request method
   * - request: Executes the DELETE request
   */
  withDelete() {
    return {
      request: () => {
        const { rel } = this.getCurrentOptions();
        this.optionsMap.set(rel, { query: undefined, method: 'DELETE' });
        return this.request();
      },
    };
  }

  private async getResourceWithRels(
    rels: string[],
  ): Promise<Resource<TEntity>> {
    let resource: Resource<SafeAny> = this.client.go(this.link);
    let state: State<SafeAny> = await resource.get();
    for (const rel of rels) {
      const currentOptions = this.optionsMap.get(rel);
      resource = state.follow(rel, currentOptions?.query ?? {});
      state = await resource.get();
    }
    return resource;
  }

  private getCurrentOptions() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rel = this.rels.at(-1)!;
    const currentOptions = this.optionsMap.get(rel) ?? {};
    return { rel, currentOptions };
  }
}
