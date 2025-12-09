import { ClientInstance } from '../client-instance.js';
import { Links } from '../links/links.js';
import { Resource } from '../resource/resource.js';
import { StateResource } from '../resource/state-resource.js';
import { Entity } from '../archtype/entity.js';
import { State } from './state.js';

type StateInit<TEntity extends Entity = Entity> = {
  client: ClientInstance;
  // uri: string;
  // data: TEntity['data'];
  links: Links<TEntity['links']>;
};

export abstract class BaseState<TEntity extends Entity = Entity> {
  client: ClientInstance;
  links: Links<TEntity['links']>;
  readonly timestamp = Date.now();

  protected constructor(init: StateInit<TEntity>) {
    this.client = init.client;
    this.links = init.links;
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new StateResource(this.client, this as unknown as State, [
        link.rel,
      ]);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }
}
