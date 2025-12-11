import { Entity } from '../archtype/entity.js';
import { SafeAny } from '../archtype/safe-any.js';
import { State } from '../state/state.js';
import { LinkVariables } from '../links/link.js';
import { HttpMethod } from '../http/util.js';

export interface RequestOptions {
  query?: Record<string, SafeAny>;
  body?: Record<string, SafeAny>;
  method?: HttpMethod;
}

export interface Resource<TEntity extends Entity> {
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]>;

  request(): Promise<State<TEntity>>;

  withGet(): Resource<TEntity>;

  withPost(data: Record<string, SafeAny>): Resource<TEntity>;

  withPut(data: Record<string, SafeAny>): Resource<TEntity>;

  withPatch(data: Record<string, SafeAny>): Resource<TEntity>;

  withDelete(): Resource<TEntity>;
}
