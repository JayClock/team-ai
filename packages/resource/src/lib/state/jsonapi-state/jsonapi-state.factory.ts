import { injectable } from 'inversify';
import { Entity } from '../../archtype/entity.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';
import { Link } from '../../links/link.js';
import { parseHeaderLink } from '../../http/util.js';
import { resolve } from '../../util/uri.js';
import { BaseState } from '../base-state.js';
import { State, StateFactory } from '../state.js';

type JsonApiLinkObject = {
  href?: string;
};

type JsonApiLink = string | JsonApiLinkObject;

type JsonApiLinksObject = Record<string, JsonApiLink | JsonApiLink[]>;

type JsonApiResource = {
  links?: JsonApiLinksObject;
};

type JsonApiTopLevelObject = {
  links?: JsonApiLinksObject;
  data: JsonApiResource | JsonApiResource[] | null;
  [key: string]: unknown;
};

function toHref(link: JsonApiLink): string | undefined {
  if (typeof link === 'string') {
    return link;
  }
  if (typeof link === 'object' && link && typeof link.href === 'string') {
    return link.href;
  }
  return undefined;
}

function parseJsonApiLinks(context: string, body: JsonApiTopLevelObject): Link[] {
  const links: Link[] = [];
  const entries = Object.entries(body.links ?? {});
  for (const [rel, linkValue] of entries) {
    const values = Array.isArray(linkValue) ? linkValue : [linkValue];
    for (const value of values) {
      const href = toHref(value);
      if (!href) {
        continue;
      }
      links.push({
        rel,
        href,
        context,
      });
    }
  }
  return links;
}

function parseJsonApiCollectionLinks(
  context: string,
  body: JsonApiTopLevelObject,
): Link[] {
  if (!Array.isArray(body.data)) {
    return [];
  }

  const links: Link[] = [];
  for (const item of body.data) {
    const selfLink = item.links?.self;
    if (!selfLink) {
      continue;
    }

    const values = Array.isArray(selfLink) ? selfLink : [selfLink];
    for (const value of values) {
      const href = toHref(value);
      if (!href) {
        continue;
      }
      links.push({
        rel: 'item',
        href,
        context,
      });
    }
  }
  return links;
}

@injectable()
export class JsonApiStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    const uri = resolve(currentLink);
    const body = (await response.json()) as JsonApiTopLevelObject;
    const links = parseHeaderLink(uri, response.headers) as unknown as Links<
      TEntity['links']
    >;
    links.add(...parseJsonApiLinks(uri, body));
    links.add(...parseJsonApiCollectionLinks(uri, body));

    return new BaseState<TEntity>({
      client,
      currentLink,
      data: body as TEntity['data'],
      headers: response.headers,
      links,
    });
  }
}
