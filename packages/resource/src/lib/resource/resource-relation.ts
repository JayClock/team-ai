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

interface ResourceOptions {
  query?: Record<string, SafeAny>;
  method?: HttpMethod;
}

export class ResourceRelation<TEntity extends Entity> {
  /**
   * Creates a new ResourceRelation instance
   * @param client The client instance used for handling requests and caching
   * @param link The link object containing resource relationships and URI templates
   * @param rels The relationship path array representing the relationship chain from root resource to target resource
   * @param optionsMap The options map storing configuration parameters for each relationship
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
    return resource.withGet().request(requestOptions);
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
   * Gets the current state of the resource.
   *
   * This function will return a State object.
   */
  async get(requestOptions?: GetRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.get(requestOptions);
  }

  /**
   * Sends a PATCH request to the resource.
   *
   * This function defaults to a application/json content-type header.
   *
   * If the server responds with 200 Status code this will return a State object
   */
  async patch(requestOptions: PatchRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.patch(requestOptions);
  }

  /**
   * Sends a POST request to the resource.
   *
   * See the documentation for PostRequestOptions for more details.
   * This function is used for RPC-like endpoints and form submissions.
   *
   * This function will return the response as a State object.
   */
  async post(options: PostRequestOptions, dedup = false): Promise<State> {
    const resource = await this.getResource();
    return resource.post(options, dedup);
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
  async put(requestOptions: PutRequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.put(requestOptions);
  }

  /**
   * Deletes the resource
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
