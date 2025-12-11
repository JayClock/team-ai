import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Entity } from './archtype/entity.js';
import { Resource } from './resource/resource.js';
import { NewLink } from './links/link.js';
import { container } from './container.js';

export interface Client {
  go<TEntity extends Entity>(link: NewLink): Resource<TEntity>;
}

export const createClient = (options: Config): Client => {
  container.bind(TYPES.Config).toConstantValue(options);
  return container.get(TYPES.Client);
};
