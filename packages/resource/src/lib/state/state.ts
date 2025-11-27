import { Entity } from '../archtype/entity.js';
import { Links } from '../links.js';
import { RelationResource } from '../resource/relation-resource.js';
import { Form } from '../form/form.js';
import { StateCollection } from './state-collection.js';

export type State<TEntity extends Entity = Entity> = {
  uri: string;

  data: TEntity['data'];

  collection: StateCollection<TEntity>;

  links: Links<TEntity['links']>;

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): RelationResource<TEntity['links'][K]>;

  getForm<K extends keyof TEntity['links']>(
    rel: K,
    method: string
  ): Form | undefined;

  clone(): State<TEntity>;
};
