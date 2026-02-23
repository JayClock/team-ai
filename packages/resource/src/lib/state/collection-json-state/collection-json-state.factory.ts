import { injectable } from 'inversify';
import { Entity } from '../../archtype/entity.js';
import { SafeAny } from '../../archtype/safe-any.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';
import { Link } from '../../links/link.js';
import { parseHeaderLink } from '../../http/util.js';
import { resolve } from '../../util/uri.js';
import { BaseState } from '../base-state.js';
import { State, StateFactory } from '../state.js';
import { Form } from '../../form/form.js';
import { Field } from '../../form/field.js';
import { StateCollection } from '../state-collection.js';

type CollectionJsonData = {
  name: string;
  value?: unknown;
  prompt?: string;
};

type CollectionJsonLink = {
  rel: string;
  href: string;
  prompt?: string;
  name?: string;
};

type CollectionJsonItem = {
  href: string;
  data?: CollectionJsonData[];
  links?: CollectionJsonLink[];
};

type CollectionJsonQuery = {
  rel: string;
  href: string;
  prompt?: string;
  data?: CollectionJsonData[];
};

type CollectionJsonTemplate = {
  data?: CollectionJsonData[];
};

type CollectionJson = {
  href?: string;
  links?: CollectionJsonLink[];
  items?: CollectionJsonItem[];
  queries?: CollectionJsonQuery[];
  template?: CollectionJsonTemplate;
  [key: string]: unknown;
};

type CollectionJsonDocument = {
  collection?: CollectionJson;
};

function dataToObject(data: CollectionJsonData[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of data) {
    result[entry.name] = entry.value;
  }
  return result;
}

function dataToFields(data: CollectionJsonData[] = []): Field[] {
  return data.map((entry) => ({
    name: entry.name,
    type: 'text',
    required: false,
    readOnly: false,
    label: entry.prompt,
    value: typeof entry.value === 'string' ? entry.value : undefined,
  }));
}

function parseCollectionLinks(context: string, collection: CollectionJson): Link[] {
  return (collection.links ?? [])
    .filter((link) => Boolean(link.href && link.rel))
    .map((link) => ({
      rel: link.rel,
      href: link.href,
      context,
      title: link.prompt,
      name: link.name,
    }));
}

function parseQueryForms(context: string, collection: CollectionJson): Form[] {
  return (collection.queries ?? []).map((query) => ({
    uri: resolve(context, query.href),
    name: query.rel,
    title: query.prompt,
    method: 'GET',
    contentType: 'application/x-www-form-urlencoded',
    fields: dataToFields(query.data),
  }));
}

function parseTemplateForm(context: string, collection: CollectionJson): Form[] {
  if (!collection.template) {
    return [];
  }
  return [
    {
      uri: resolve(context, collection.href ?? ''),
      name: 'create',
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      fields: dataToFields(collection.template.data),
    },
  ];
}

@injectable()
export class CollectionJsonStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    const uri = resolve(currentLink);
    const body = (await response.json()) as CollectionJsonDocument;
    const collection = body.collection ?? {};
    const links = parseHeaderLink(uri, response.headers) as unknown as Links<
      TEntity['links']
    >;
    links.add(...parseCollectionLinks(uri, collection));

    const itemStates = ((collection.items ?? []) as CollectionJsonItem[])
      .filter((item) => Boolean(item.href))
      .map((item) => {
        links.add({
          rel: 'item',
          href: item.href,
        });

        const itemUri = resolve(uri, item.href);
        const itemLinks = new Links<Record<string, SafeAny>>(itemUri, [
          { rel: 'self', href: itemUri },
          ...(item.links ?? []).map((link) => ({
            rel: link.rel,
            href: link.href,
            title: link.prompt,
            name: link.name,
          })),
        ]);

        return new BaseState({
          client,
          currentLink: {
            rel: 'item',
            href: item.href,
            context: uri,
          },
          data: dataToObject(item.data),
          headers: new Headers({
            'Content-Type':
              response.headers.get('Content-Type') ??
              'application/vnd.collection+json',
          }),
          links: itemLinks,
          isPartial: true,
        });
      });

    const { links: _, items: __, queries: ___, template: ____, ...rest } =
      collection;

    return new BaseState<TEntity>({
      client,
      currentLink,
      data: rest as TEntity['data'],
      headers: response.headers,
      links,
      collection: itemStates as unknown as StateCollection<TEntity>,
      forms: [
        ...parseQueryForms(uri, collection),
        ...parseTemplateForm(uri, collection),
      ],
    });
  }
}
