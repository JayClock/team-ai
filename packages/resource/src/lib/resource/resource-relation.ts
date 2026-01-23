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

/**
 * @internal
 */
interface ResourceOptions {
  query?: Record<string, SafeAny>;
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
  ) { }

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
