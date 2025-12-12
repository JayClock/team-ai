import { SafeAny } from '../archtype/safe-any.js';
import { ResourceOptions, Resource } from './resource.js';
import { LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';

export abstract class BaseResource<TEntity extends Entity>
  implements Resource<TEntity>
{
  protected constructor(
    protected readonly client: ClientInstance,
    protected readonly optionsMap: Map<string, ResourceOptions> = new Map()
  ) {}

  protected initRequestOptionsWithRel(
    rel: string,
    requestOptions: ResourceOptions
  ): void {
    this.optionsMap.set(rel, requestOptions);
  }

  withGet(): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'GET' });
    return this;
  }

  withPost(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'POST', data });
    return this;
  }

  withPut(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'PUT', data });
    return this;
  }

  withPatch(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'PATCH', data });
    return this;
  }

  withDelete(): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'DELETE' });
    return this;
  }

  abstract follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]>;

  abstract request(): Promise<State<TEntity>>;

  abstract getCurrentOptions(): {
    rel: string;
    options: ResourceOptions;
  };
}
