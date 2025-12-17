import { Entity } from 'src/lib/archtype/entity.js';
import { BaseState } from '../base-state.js';
import { HalLink, HalResource } from 'hal-types';
import { ClientInstance } from 'src/lib/client-instance.js';
import { State, StateFactory } from '../state.js';
import { parseHalLinks } from './parse-hal-links.js';
import { parseHalTemplates } from './parse-hal-templates.js';
import { injectable } from 'inversify';
import { Links } from '../../links/links.js';
import { Link } from '../../links/link.js';
import { SafeAny } from '../../archtype/safe-any.js';

/**
 * Turns a HTTP response into a HalState
 */
@injectable()
export class HalStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
    prevLink?: Link,
  ): Promise<State<TEntity>> {
    const halResource = (await response.json()) as HalResource;
    return this.createHalStateFromResource(
      halResource,
      client,
      response.headers,
      currentLink,
      prevLink,
    );
  }

  private createHalStateFromResource(
    halResource: HalResource,
    client: ClientInstance,
    headers: Headers,
    currentLink: Link,
    prevLink?: Link,
  ): State<SafeAny> {
    const { _links, _embedded, _templates, ...pureData } = halResource;
    const links = new Links(client.bookmarkUri, parseHalLinks(_links));
    const forms = parseHalTemplates(links, _templates);
    const embeddedState = this.getEmbeddedState(
      _embedded,
      links,
      client,
      currentLink,
    );

    const collection = this.getCollection(currentLink, _embedded, client);

    return new HalState<SafeAny>({
      client,
      headers,
      data: pureData,
      links: links,
      forms: forms,
      collection,
      currentLink,
      prevLink,
      embeddedState,
    });
  }

  private getCollection(
    currentLink: Link,
    _embedded: HalResource['_embedded'],
    client: ClientInstance,
  ) {
    const rel = currentLink.rel;
    if (_embedded && Array.isArray(_embedded[rel])) {
      return _embedded[rel].map((embedded) => {
        const selfHalLink = embedded._links?.self as HalLink;
        const selfLink: Link = {
          ...selfHalLink,
          rel: 'self',
          context: client.bookmarkUri,
        };
        return this.createHalStateFromResource(
          embedded,
          client,
          new Headers(),
          selfLink,
        );
      });
    }
    return [];
  }

  private getEmbeddedState(
    _embedded: HalResource['_embedded'],
    links: Links<Record<string, SafeAny>>,
    client: ClientInstance,
    prevLink: Link,
  ) {
    const embeddedState: Record<string, State<SafeAny>> = {};
    for (const [key, value] of Object.entries(_embedded ?? {})) {
      const link = links.get(key);
      if (!link) {
        continue;
      }
      if (Array.isArray(value)) {
        embeddedState[key] = new HalState<SafeAny>({
          client: client,
          data: {},
          collection: value.map((item) => {
            const sefHalLink = item._links?.self as HalLink;
            const selfLink: Link = {
              ...sefHalLink,
              rel: 'self',
              context: client.bookmarkUri,
            };
            return this.createHalStateFromResource(
              item,
              client,
              new Headers(),
              selfLink,
            );
          }),
          links: new Links(client.bookmarkUri),
          headers: new Headers(),
          currentLink: link,
          prevLink: prevLink,
        });
      } else {
        const sefHalLink = value._links?.self as HalLink;
        const selfLink: Link = {
          ...sefHalLink,
          rel: 'self',
          context: client.bookmarkUri,
        };
        embeddedState[key] = this.createHalStateFromResource(
          value,
          client,
          new Headers(),
          selfLink,
          prevLink,
        );
      }
    }
    return embeddedState;
  }
}

class HalState<TEntity extends Entity> extends BaseState<TEntity> {
  override serializeBody(): string {
    return JSON.stringify({
      ...this.data,
      _links: this.serializeLinks(),
    });
  }

  override clone(): State<TEntity> {
    return new HalState<TEntity>({
      ...this.init,
      data: structuredClone(this.data),
    });
  }

  private serializeLinks(): HalResource['_links'] {
    const links: HalResource['_links'] = {
      self: { href: new URL(this.uri).pathname },
    };

    for (const link of this.links.getAll()) {
      const { rel, context, ...attributes } = link;
      if (rel === 'self') {
        // skip
        continue;
      }

      if (links[rel] === undefined) {
        // First link of its kind
        links[rel] = attributes;
      } else if (Array.isArray(links[rel])) {
        // Add link to link array.
        (links[rel] as HalLink[]).push(attributes);
      } else {
        // 1 link with this rel existed, so we will transform it to an array.
        links[rel] = [links[rel] as HalLink, attributes];
      }
    }
    return links;
  }
}
