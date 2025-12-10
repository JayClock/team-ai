import { HalLink, HalResource } from 'hal-types';
import { State } from '../state.js';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { HalState } from './hal-state.js';
import { ClientInstance } from '../../client-instance.js';

export const parseHalEmbedded = (
  client: ClientInstance,
  embedded: HalResource['_embedded']
): Record<string, State | State[]> => {
  const embeddedResource = embedded || {};
  const result: Record<string, State | State[]> = {};

  Object.entries(embeddedResource).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        createHalStateFromResource(client, item)
      ) as State[];
    } else {
      result[key] = createHalStateFromResource(client, value) as State;
    }
  });

  return result;
};

function createHalStateFromResource(
  client: ClientInstance,
  halResource: HalResource
): State {
  const { _links, _embedded, _templates, ...pureData } = halResource;
  const links = parseHalLinks(_links);
  const forms = parseHalTemplates(links, _templates);

  return new HalState({
    client: client,
    uri: (_links?.self as HalLink)?.href || '',
    halResource: halResource,
    headers: new Headers(),
    data: pureData,
    links: links,
    forms: forms,
    collection: [],
    embedded: parseHalEmbedded(client, _embedded),
  });
}
