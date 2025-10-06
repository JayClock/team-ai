import { BaseState } from './base-state.js';
import { Client } from '../client.js';
import { HalLink, HalResource } from 'hal-types';
import { Links } from '../links.js';

export function HalStateFactory(
  client: Client,
  uri: string,
  halResource: HalResource,
  collectionRel?: string
): BaseState {
  const { _links, _embedded, _templates, ...prueData } = halResource;
  return new BaseState({
    client,
    uri,
    data: prueData,
    links: createLinks(_links),
    collection: collectionRel
      ? createCollections(client, _embedded, collectionRel)
      : [],
  });
}

function createLinks<TLinks extends Record<string, any>>(
  halLinks: HalResource['_links']
): Links<TLinks> {
  const links = new Links<TLinks>();
  for (const [key, value] of Object.entries(halLinks ?? [])) {
    const linkList = Array.isArray(value) ? value : [value];
    links.add(linkList.map((item) => ({ ...item, rel: key })));
  }
  return links;
}

function createCollections(
  client: Client,
  embedded: HalResource['_embedded'],
  collectionRel: string
) {
  if (!embedded) {
    return [];
  }
  const embeddedData = embedded[collectionRel as string] as HalResource[];
  return embeddedData.map((data) => {
    return HalStateFactory(client, (data._links!.self as HalLink).href, data);
  });
}
