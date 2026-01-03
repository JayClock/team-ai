import { ClientInstance } from '../client-instance.js';
import { Link, LinkVariables } from '../links/link.js';
import { RequestOptions } from './interface.js';
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
  async request(requestOptions?: RequestOptions): Promise<State<TEntity>> {
    const resource = await this.getResource();
    return resource.request(requestOptions);
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
   */
  async getForm(): Promise<Form | undefined> {
    const prevResource = await this.getResourceWithRels(this.rels.slice(0, -1));
    const { currentOptions } = this.getCurrentOptions();
    const prevState = (await prevResource.request()) as BaseState<TEntity>;
    return prevState.getForm(this.link.rel, currentOptions.method);
  }

  /**
   * Follows a resource relationship based on its rel type
   * @param rel The relationship type, must be a key defined in the entity links
   * @returns Returns a new ResourceRelation instance representing the followed relationship
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
  ): ResourceRelation<TEntity['links'][K]> {
    return new ResourceRelation(
      this.client,
      this.link,
      this.rels.concat(rel as string),
      this.optionsMap,
    );
  }

  /**
   * Sets URI template parameters
   * @param variables The template parameter variables to set
   * @returns Returns the current ResourceRelation instance for method chaining
   */
  withTemplateParameters(variables: LinkVariables): ResourceRelation<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, query: variables });
    return this;
  }

  /**
   * Sets the HTTP request method
   * @param method The HTTP method to set
   * @returns Returns the current ResourceRelation instance for method chaining
   */
  withMethod(method: HttpMethod): ResourceRelation<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, method: method });
    return this;
  }

  private async getResourceWithRels(
    rels: string[],
  ): Promise<Resource<TEntity>> {
    let resource: Resource<SafeAny> = this.client.go(this.link);
    let state: State<SafeAny> = await resource.request();
    for (const rel of rels) {
      const currentOptions = this.optionsMap.get(rel);
      resource = state
        .follow(rel, currentOptions?.query ?? {})
        .withMethod(currentOptions?.method ?? 'GET')
        .withTemplateParameters(currentOptions?.query ?? {});
      state = await resource.request();
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
