import { ClientInstance } from './client-instance.js';
import { Container } from 'inversify';
import { Fetcher } from './http/fetcher.js';
import { TYPES } from './archtype/injection-types.js';
import { HalStateFactory } from './state/hal-state/hal-state.factory.js';

export const container = new Container();
container.bind(TYPES.Client).to(ClientInstance).inSingletonScope();
container.bind(TYPES.Fetcher).to(Fetcher).inSingletonScope();
container.bind(TYPES.HalStateFactory).to(HalStateFactory).inSingletonScope();
