import { BaseState } from './base-state.js';
import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import { HalLink, HalResource } from 'hal-types';
import { Links } from '../links.js';
import { Form, State } from './interface.js';

export function HalStateFactory<TEntity extends Entity>(
  client: Client,
  uri: string,
  halResource: HalResource,
  collectionRel?: string
): State<TEntity> {
  const { _links, _embedded, _templates, ...prueData } = halResource;
  const embedded = parseHalEmbedded(client, _embedded);
  return new BaseState<TEntity>({
    client,
    uri,
    data: prueData,
    links: parseHalLinks(_links),
    collection: collectionRel ? (embedded[collectionRel] as State[]) ?? [] : [],
    forms: parseHalTemplates(_links, _templates),
    embedded: embedded,
  });
}

function parseHalLinks<TLinks extends Record<string, any>>(
  halLinks: HalResource['_links']
): Links<TLinks> {
  const links = new Links<TLinks>();
  for (const [key, value] of Object.entries(halLinks ?? [])) {
    const linkList = Array.isArray(value) ? value : [value];
    links.add(
      linkList.map((item) => ({ ...item, rel: key, type: item.type ?? 'GET' }))
    );
  }
  return links;
}

function parseHalTemplates(
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

function parseHalEmbedded(
  client: Client,
  embedded: HalResource['_embedded'] = {}
): Record<string, State | State[]> {
  const res: Record<string, State | State[]> = {};
  for (const [rel, resource] of Object.entries(embedded)) {
    if (Array.isArray(resource)) {
      res[rel] = resource.map((data) =>
        HalStateFactory(client, (data._links!.self as HalLink).href, data)
      );
    } else {
      res[rel] = HalStateFactory(
        client,
        (resource._links!.self as HalLink).href,
        resource
      );
    }
  }
  return res;
}
