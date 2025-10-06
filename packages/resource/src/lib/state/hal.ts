import { BaseState } from './base-state.js';
import { BaseSchema } from '../base-schema.js';
import { Client } from '../client.js';
import { HalLink, HalResource } from 'hal-types';
import { Links } from '../links.js';
import { Form, State } from './interface.js';

export function HalStateFactory<TSchema extends BaseSchema>(
  client: Client,
  uri: string,
  halResource: HalResource,
  collectionRel?: string
): State<TSchema> {
  const { _links, _embedded, _templates, ...prueData } = halResource;
  return new BaseState<TSchema>({
    client,
    uri,
    data: prueData,
    links: createLinks(_links),
    collection: collectionRel
      ? createCollections(client, _embedded, collectionRel)
      : [],
    forms: createForms(_links, _templates),
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

function createCollections<TSchema extends BaseSchema>(
  client: Client,
  embedded: HalResource['_embedded'],
  collectionRel: string
) {
  if (!embedded) {
    return [];
  }
  const embeddedData = embedded[collectionRel as string] as HalResource[];
  return embeddedData.map((data) => {
    return HalStateFactory<TSchema>(
      client,
      (data._links!.self as HalLink).href,
      data
    );
  });
}

function createForms(
  links: HalResource['_links'] = {},
  templates: HalResource['_templates'] = {}
): Form[] {
  return Object.values(templates).map((template) => ({
    title: template.title,
    method: template.method,
    uri: template.target ?? (links.self as HalLink).href,
    contentType: template.contentType ?? 'application/json',
  }));
}
