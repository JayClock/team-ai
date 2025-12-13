import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Entity } from './archtype/entity.js';
import { Resource } from './resource/resource.js';
import { NewLink } from './links/link.js';
import { container } from './container.js';
import { FetchMiddleware } from './http/fetcher.js';

export interface Client {
  go<TEntity extends Entity>(link?: string | NewLink): Resource<TEntity>;

  /**
   * Adds a fetch middleware, which will be executed for
   * each fetch() call.
   *
   * If 'origin' is specified, fetch middlewares can be executed
   * only if the host/origin matches.
   *
   * 'origin' default value is *
   */
  use(middleware: FetchMiddleware, origin?: string): void;
}

export const createClient = (options: Config): Client => {
  container.bind(TYPES.Config).toConstantValue(options);
  return container.get(TYPES.Client);
};
