import { HalLink, HalResource } from 'hal-types';
import { State } from '../state.js';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { BaseState } from '../base-state.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';

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
  const links = new Links(
    client.bookmarkUri,
    parseHalLinks(_links)
  );
  const forms = parseHalTemplates(links, _templates);

  return new BaseState({
    client: client,
    uri: (_links?.self as HalLink)?.href || '',
    headers: new Headers(),
    data: pureData,
    links: links,
    forms: forms,
    collection: [],
    embedded: parseHalEmbedded(client, _embedded),
  });
}
