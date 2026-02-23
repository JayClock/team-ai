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

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  );
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function parseHtmlLinks(context: string, body: string): Link[] {
  const links: Link[] = [];
  const tagPattern = /<(?:a|link)\b[^>]*>/gi;
  for (const tag of body.match(tagPattern) ?? []) {
    const href = readAttribute(tag, 'href');
    const rel = readAttribute(tag, 'rel');
    if (!href || !rel) {
      continue;
    }
    for (const relation of rel.split(/\s+/).filter(Boolean)) {
      links.push({
        rel: relation,
        href,
        context,
        title: readAttribute(tag, 'title'),
        type: readAttribute(tag, 'type'),
      });
    }
  }
  return links;
}

function parseHtmlForms(context: string, body: string): Form[] {
  const forms: Form[] = [];
  const formPattern = /<form\b[^>]*>/gi;
  for (const tag of body.match(formPattern) ?? []) {
    const action = readAttribute(tag, 'action') ?? '';
    const method = (readAttribute(tag, 'method') ?? 'GET').toUpperCase();
    forms.push({
      uri: resolve(context, action),
      name:
        readAttribute(tag, 'rel') ??
        readAttribute(tag, 'id') ??
        readAttribute(tag, 'name') ??
        '',
      method,
      contentType:
        readAttribute(tag, 'enctype') ?? 'application/x-www-form-urlencoded',
      fields: [],
    });
  }
  return forms;
}

@injectable()
export class HtmlStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    const uri = resolve(currentLink);
    const body = await response.text();
    const links = parseHeaderLink(uri, response.headers) as unknown as Links<
      TEntity['links']
    >;
    links.add(...parseHtmlLinks(uri, body));

    return new BaseState<TEntity>({
      client,
      currentLink,
      data: body as TEntity['data'],
      headers: response.headers,
      links,
      forms: parseHtmlForms(uri, body),
    });
  }
}
