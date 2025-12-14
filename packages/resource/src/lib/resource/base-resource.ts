import { ResourceOptions, Resource, RequestOptions } from './resource.js';
import { LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';
import { HttpMethod } from '../http/util.js';
import EventEmitter from 'events';

export abstract class BaseResource<TEntity extends Entity>
  extends EventEmitter
  implements Resource<TEntity>
{
  protected constructor(
    readonly client: ClientInstance,
    protected readonly optionsMap: Map<string, ResourceOptions> = new Map(),
  ) {
    super();
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

  abstract request(requestOptions?: RequestOptions): Promise<State<TEntity>>;

  abstract getCurrentOptions(): {
    rel: string;
    currentOptions: ResourceOptions;
  };
}
