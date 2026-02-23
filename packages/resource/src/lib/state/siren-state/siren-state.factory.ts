import { injectable } from 'inversify';
import { Entity } from '../../archtype/entity.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';
import { Link } from '../../links/link.js';
import { parseHeaderLink } from '../../http/util.js';
import { resolve } from '../../util/uri.js';
import { BaseState } from '../base-state.js';
import { State, StateFactory } from '../state.js';
import { Form } from '../../form/form.js';
import { Field } from '../../form/field.js';

type SirenLink = {
  rel: string[];
  href: string;
  type?: string;
  title?: string;
};

type SirenField = {
  name: string;
  type?: string;
  value?: unknown;
  title?: string;
};

type SirenAction = {
  name: string;
  method?: string;
  href: string;
  title?: string;
  type?: string;
  fields?: SirenField[];
};

type SirenEntity = {
  rel?: string[];
  links?: SirenLink[];
  entities?: (SirenLink | SirenEntity)[];
  actions?: SirenAction[];
  properties?: Record<string, unknown>;
};

function parseSirenLink(context: string, link: SirenLink): Link[] {
  return link.rel.map((rel) => ({
    rel,
    href: link.href,
    context,
    type: link.type,
    title: link.title,
  }));
}

function parseSirenLinks(context: string, entity: SirenEntity): Link[] {
  const links: Link[] = [];

  for (const link of entity.links ?? []) {
    links.push(...parseSirenLink(context, link));
  }

  for (const nested of entity.entities ?? []) {
    if ('href' in nested) {
      links.push(...parseSirenLink(context, nested));
      continue;
    }

    if (!nested.rel?.length) {
      continue;
    }
    const selfHref = nested.links
      ?.find((candidate) => candidate.rel.includes('self'))
      ?.href;
    if (!selfHref) {
      continue;
    }

    for (const rel of nested.rel) {
      links.push({
        rel,
        href: selfHref,
        context,
      });
    }
  }

  return links;
}

function parseSirenField(field: SirenField): Field {
  switch (field.type) {
    case 'hidden':
      return {
        name: field.name,
        type: 'hidden',
        required: false,
        readOnly: false,
        label: field.title,
        value:
          typeof field.value === 'string' ||
          typeof field.value === 'number' ||
          typeof field.value === 'boolean' ||
          field.value === null
            ? field.value
            : undefined,
      };
    case 'number':
    case 'range':
      return {
        name: field.name,
        type: field.type,
        required: false,
        readOnly: false,
        label: field.title,
        value:
          typeof field.value === 'number'
            ? field.value
            : typeof field.value === 'string'
              ? Number(field.value)
              : undefined,
      };
    case 'checkbox':
    case 'radio':
      return {
        name: field.name,
        type: field.type,
        required: false,
        readOnly: false,
        label: field.title,
        value: Boolean(field.value),
      };
    case 'file':
      return {
        name: field.name,
        type: 'file',
        required: false,
        readOnly: false,
        label: field.title,
      };
    case 'date':
    case 'month':
    case 'week':
    case 'time':
      return {
        name: field.name,
        type: field.type,
        required: false,
        readOnly: false,
        label: field.title,
        value: typeof field.value === 'string' ? field.value : undefined,
      };
    case 'datetime':
    case 'datetime-local':
      return {
        name: field.name,
        type: field.type,
        required: false,
        readOnly: false,
        label: field.title,
        value: typeof field.value === 'string' ? new Date(field.value) : undefined,
      };
    case 'search':
    case 'tel':
    case 'url':
    case 'email':
    case 'password':
    case 'color':
      return {
        name: field.name,
        type: field.type,
        required: false,
        readOnly: false,
        label: field.title,
        value: typeof field.value === 'string' ? field.value : undefined,
      };
    default:
      return {
        name: field.name,
        type: 'text',
        required: false,
        readOnly: false,
        label: field.title,
        value: typeof field.value === 'string' ? field.value : undefined,
      };
  }
}

function parseSirenActions(context: string, entity: SirenEntity): Form[] {
  return (entity.actions ?? []).map((action) => ({
    uri: resolve(context, action.href),
    name: action.name,
    title: action.title,
    method: (action.method ?? 'GET').toUpperCase(),
    contentType: action.type ?? 'application/x-www-form-urlencoded',
    fields: (action.fields ?? []).map((field) => parseSirenField(field)),
  }));
}

@injectable()
export class SirenStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    const uri = resolve(currentLink);
    const body = (await response.json()) as SirenEntity;
    const links = parseHeaderLink(uri, response.headers) as unknown as Links<
      TEntity['links']
    >;
    links.add(...parseSirenLinks(uri, body));

    return new BaseState<TEntity>({
      client,
      currentLink,
      data: (body.properties ?? {}) as TEntity['data'],
      headers: response.headers,
      links,
      forms: parseSirenActions(uri, body),
    });
  }
}
