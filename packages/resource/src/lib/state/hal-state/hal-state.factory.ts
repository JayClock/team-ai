import { Entity } from 'src/lib/archtype/entity.js';
import { HalState } from './hal-state.js';
import { HalResource } from 'hal-types';
import { ClientInstance } from 'src/lib/client-instance.js';
import { State, StateFactory } from '../state.js';
import { StateCollection } from '../state-collection.js';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { parseHalEmbedded } from './parse-hal-embedded.js';

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
    const links = parseHalLinks(_links);
    const forms = parseHalTemplates(links, _templates);
    const embedded = parseHalEmbedded(client, _embedded);
    return new HalState<TEntity>({
      client,
      uri,
      halResource,
      headers: response.headers,
      data: pureData,
      links: links,
      forms: forms,
      collection: rel ? getCollection(embedded, rel) : [],
      embedded: embedded,
    });
  }
}

export const halStateFactory = new HalStateFactory();

export function getCollection<TEntity extends Entity>(
  embedded: Record<string, State | State[]>,
  rel: string
): StateCollection<TEntity> {
  if (!embedded || !embedded[rel]) {
    return [];
  }
  const embeddedResource: HalResource | HalResource[] = embedded[rel];
  if (Array.isArray(embeddedResource)) {
    return embeddedResource as StateCollection<TEntity>;
  }
  return [];
}
