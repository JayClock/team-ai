import { HalLink, HalResource } from 'hal-types';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { BaseState } from '../base-state.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';
import { Entity } from '../../archtype/entity.js';
import { EmbeddedStates } from '../state-collection.js';
import { resolve } from '../../util/uri.js';

export const parseHalEmbedded = <TEntity extends Entity>(
  client: ClientInstance,
  embedded: HalResource['_embedded'],
): Partial<EmbeddedStates<TEntity>> => {
  const embeddedResource = embedded || {};
  const result: Record<string, unknown> = {};

  Object.entries(embeddedResource).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        createHalStateFromResource(client, item),
      );
    } else {
      result[key] = createHalStateFromResource(client, value);
    }
  });

  return result as Partial<EmbeddedStates<TEntity>>;
};

function createHalStateFromResource(
  client: ClientInstance,
  halResource: HalResource,
) {
  const { _links, _embedded, _templates, ...pureData } = halResource;
  const links = new Links(client.bookmarkUri, parseHalLinks(_links));
  const forms = parseHalTemplates(links, _templates);

  return new BaseState({
    client: client,
    uri: resolve(client.bookmarkUri, (_links?.self as HalLink)?.href || ''),
    headers: new Headers(),
    data: pureData,
    links: links,
    forms: forms,
    collection: [],
    embedded: parseHalEmbedded(client, _embedded),
  });
}
