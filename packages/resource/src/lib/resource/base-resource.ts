import {
  ResourceOptions,
  Resource,
  GetRequestOptions,
  PostRequestOptions,
  PatchRequestOptions,
  GetResource,
  PostResource,
  PutResource,
  PatchResource,
  DeleteResource,
} from './resource.js';
import { LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';
import { HttpMethod } from '../http/util.js';

export abstract class BaseResource<
  TEntity extends Entity,
> implements Resource<TEntity> {
  protected constructor(
    readonly client: ClientInstance,
    protected readonly optionsMap: Map<string, ResourceOptions> = new Map(),
  ) {}

  protected initRequestOptionsWithRel(
    rel: string,
    requestOptions: ResourceOptions,
  ): void {
    this.optionsMap.set(rel, requestOptions);
  }

  withGet(options?: GetRequestOptions): GetResource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, ...options, method: 'GET' });
    return this;
  }

  withPost(options: PostRequestOptions): PostResource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, ...options, method: 'POST' });
    return this;
  }

  withPut(options: PostRequestOptions): PutResource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, ...options, method: 'PUT' });
    return this;
  }

  withPatch(options: PatchRequestOptions): PatchResource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, {
      ...currentOptions,
      ...options,
      method: 'PATCH',
    });
    return this;
  }

  withDelete(): DeleteResource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, method: 'DELETE' });
    return this;
  }

  withTemplateParameters(variables: LinkVariables): Resource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, query: variables });
    return this;
  }

  withMethod(method: HttpMethod): Resource<TEntity> {
    const { rel, currentOptions } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...currentOptions, method: method });
    return this;
  }

  abstract follow<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>;

  abstract _request(): Promise<State<TEntity>>;

  abstract getCurrentOptions(): {
    rel: string;
    currentOptions: ResourceOptions;
  };
}
