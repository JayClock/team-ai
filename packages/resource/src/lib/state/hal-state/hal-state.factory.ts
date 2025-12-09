import { Entity } from 'src/lib/archtype/entity.js';
import { HalState } from './hal-state.js';
import { HalResource } from 'hal-types';
import { ClientInstance } from 'src/lib/client-instance.js';
import { State, StateFactory } from '../state.js';

/**
 * Turns a HTTP response into a HalState
 */
export class HalStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response,
    rel?: string
  ): Promise<State<TEntity>> {
    const halResource = (await response.json()) as HalResource;
    return new HalState<TEntity>({ client, uri, halResource, rel });
  }
}

export const halStateFactory = new HalStateFactory();
