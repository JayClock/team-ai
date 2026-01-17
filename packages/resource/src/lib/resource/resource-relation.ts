import { ClientInstance } from '../client-instance.js';
import { Link, LinkVariables } from '../links/link.js';
import {
  GetRequestOptions,
  PatchRequestOptions,
  PostRequestOptions,
  PutRequestOptions,
} from './interface.js';
import { Entity } from '../archtype/entity.js';
import { State } from '../state/state.js';
import Resource from './resource.js';
import { SafeAny } from '../archtype/safe-any.js';

interface ResourceOptions {
  query?: Record<string, SafeAny>;
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
   * Gets the resource instance
   * @returns Returns a Promise of the resource instance
   */
  async getResource(): Promise<Resource<TEntity>> {
    return this.getResourceWithRels(this.rels);
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
  async post(
    options: PostRequestOptions,
    postOptions?: { dedup?: boolean },
  ): Promise<State> {
    const resource = await this.getResource();
    return resource.post(options, postOptions);
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
}
