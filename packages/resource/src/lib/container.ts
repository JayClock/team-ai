import { ClientInstance } from './client-instance.js';
import { Container } from 'inversify';
import { Fetcher } from './http/fetcher.js';
import { TYPES } from './archtype/injection-types.js';
import { HalStateFactory } from './state/hal-state/hal-state.factory.js';
import { BinaryStateFactory } from './state/binary-state/binary-state.factory.js';
import { ForeverCache } from './cache/forever-cache.js';
import { StreamStateFactory } from './state/stream-state/stream-state.factory.js';

export const createContainer = (): Container => {
  const container = new Container();
  container.bind(TYPES.Client).to(ClientInstance).inSingletonScope();
  container.bind(TYPES.Fetcher).to(Fetcher).inSingletonScope();
  container.bind(TYPES.HalStateFactory).to(HalStateFactory).inSingletonScope();
  container
    .bind(TYPES.BinaryStateFactory)
    .to(BinaryStateFactory)
    .inSingletonScope();
  container
    .bind(TYPES.StreamStateFactory)
    .to(StreamStateFactory)
    .inSingletonScope();
  container.bind(TYPES.Cache).to(ForeverCache).inSingletonScope();
  return container;
};

export const container = createContainer();
