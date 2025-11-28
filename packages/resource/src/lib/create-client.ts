import { Client } from './client.js';
import { Container } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Config } from './archtype/config.js';
import { Fetcher } from './http/fetcher.js';

export const createClient = (options: Config): Client => {
  const container = new Container();
  container.bind(TYPES.Config).toConstantValue(options);
  container.bind(TYPES.Client).to(Client).inSingletonScope();
  container.bind(TYPES.Fetcher).to(Fetcher).inSingletonScope();
  return container.get(TYPES.Client);
};
