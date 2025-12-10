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
    const { _links, _embedded, _templates, ...pureData } = halResource;
    const links = HalState.parseHalLinks(_links);
    const forms = HalState.parseHalTemplates(links, _templates);
    return new HalState<TEntity>({
      client,
      uri,
      halResource,
      headers: response.headers,
      data: pureData,
      links: links,
      forms: forms,
      collection: rel ? HalState.getCollection(client, _embedded, rel) : [],
    });
  }
}

export const halStateFactory = new HalStateFactory();
