import { ClientInstance } from './client-instance.js';
import { Container } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Fetcher } from './http/fetcher.js';
import { Entity } from './archtype/entity.js';
import { Link } from './links.js';
import { Resource } from './resource/resource.js';

export interface Client {
  go<TEntity extends Entity>(link: Link): Resource<TEntity>;
}

export const createClient = (options: Config): Client => {
  const container = new Container();
  container.bind(TYPES.Config).toConstantValue(options);
  container.bind(TYPES.Client).to(ClientInstance).inSingletonScope();
  container.bind(TYPES.Fetcher).to(Fetcher).inSingletonScope();
  return container.get(TYPES.Client);
};
