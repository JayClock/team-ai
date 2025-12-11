import { Entity } from '../archtype/entity.js';
import { SafeAny } from '../archtype/safe-any.js';
import { State } from '../state/state.js';
import { LinkVariables } from '../links/link.js';

export interface RequestOptions {
  query?: Record<string, SafeAny>;
  body?: Record<string, SafeAny>;
}

export interface Resource<TEntity extends Entity> {
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]>;

  request(): Promise<State<TEntity>>;

  withRequestOptions(options: RequestOptions): Resource<TEntity>;
}
