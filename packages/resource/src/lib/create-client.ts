import { Client } from './client.js';
import { Container } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Fetcher } from './http/fetcher.js';
import { ResourceFactory } from './resource/resource-factory.js';

export const createClient = (options: Config) => {
  const container = new Container();
  container.bind(TYPES.Config).toConstantValue(options);
  container.bind(TYPES.Client).to(Client).inSingletonScope();
  container.bind(TYPES.Fetcher).to(Fetcher).inSingletonScope();
  container.bind(TYPES.ResourceFactory).to(ResourceFactory).inSingletonScope();
  return container.get(Client);
};
