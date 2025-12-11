import { Entity } from 'src/lib/archtype/entity.js';
import { BaseState } from '../base-state.js';
import { HalLink, HalResource } from 'hal-types';
import { ClientInstance } from 'src/lib/client-instance.js';
import { State, StateFactory } from '../state.js';
import { StateCollection } from '../state-collection.js';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { parseHalEmbedded } from './parse-hal-embedded.js';
import { injectable } from 'inversify';

/**
 * Turns a HTTP response into a HalState
 */
@injectable()
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
      headers: response.headers,
      data: pureData,
      links: links,
      forms: forms,
      collection: rel ? getCollection(embedded, rel) : [],
      embedded: embedded,
    });
  }
}

class HalState<TEntity extends Entity> extends BaseState<TEntity> {
  override serializeBody(): string {
    return JSON.stringify({
      ...this.data,
      _links: this.serializeLinks(),
    });
  }

  override clone(): State<TEntity> {
    return new HalState<TEntity>(this.init);
  }

  private serializeLinks(): HalResource['_links'] {
    const links: HalResource['_links'] = {
      self: { href: this.uri },
    };

    for (const link of this.links.getAll()) {
      const { rel, ...attributes } = link;
      if (rel === 'self') {
        // skip
        continue;
      }

      if (links[rel] === undefined) {
        // First link of its kind
        links[rel] = attributes;
      } else if (Array.isArray(links[rel])) {
        // Add link to link array.
        (links[rel] as HalLink[]).push(attributes);
      } else {
        // 1 link with this rel existed, so we will transform it to an array.
        links[rel] = [links[rel] as HalLink, attributes];
      }
    }
    return links;
  }
}

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
