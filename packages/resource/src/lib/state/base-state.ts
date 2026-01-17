import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { ClientInstance } from '../client-instance.js';
import { entityHeaderNames } from '../http/util.js';
import { SafeAny } from '../archtype/safe-any.js';
import { Resource } from '../index.js';
import { Link, LinkVariables } from '../links/link.js';
import { resolve } from '../util/uri.js';
import { expand } from '../util/uri-template.js';
import {
  Action,
  ActionNotFound,
  AmbiguousActionError,
  SimpleAction,
} from '../action/action.js';
import { HttpMethod } from '../http/util.js';

type StateInit<TEntity extends Entity> = {
  client: ClientInstance;
  data: TEntity['data'];
  links: Links<TEntity['links']>;
  headers: Headers;
  currentLink: Link;
  forms?: Form[];
  collection?: StateCollection<TEntity>;
  prevLink?: Link;
  embeddedState?: TEntity['links'];
};

export class BaseState<TEntity extends Entity> implements State<TEntity> {
  readonly uri: string;
  readonly client: ClientInstance;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['links']>;
  readonly timestamp = Date.now();

  private readonly forms: Form[];
  private readonly headers: Headers;

  constructor(protected init: StateInit<TEntity>) {
    this.uri = resolve(this.init.currentLink);
    this.client = init.client;
    this.data = init.data;
    this.links = init.links;
    this.headers = init.headers;
    this.forms = init.forms ?? [];
    this.collection = init.collection ?? [];
  }

  hasLink<K extends keyof TEntity['links']>(rel: K): boolean {
    return this.links.has(rel);
  }

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel as string);
  }

  serializeBody(): Buffer | Blob | string {
    const data = this.data as SafeAny;
    if (
      ((global as SafeAny).Buffer && data instanceof Buffer) ||
      ((global as SafeAny).Blob && data instanceof Blob) ||
      typeof data === 'string'
    ) {
      return this.data;
    }
    return JSON.stringify(data);
  }

  contentHeaders(): Headers {
    const result: { [name: string]: string } = {};
    for (const contentHeader of entityHeaderNames) {
      if (this.headers.has(contentHeader)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result[contentHeader] = this.headers.get(contentHeader)!;
      }
    }
    return new Headers(result);
  }

  /**
   * Follows a link relation and returns the associated resource.
   *
   * @RFC
   * - RFC 8288 (Web Linking): Defines link relations and their semantics
   * - RFC 6573 (Collection Link + JSON): Defines collection patterns
   *
   * Special handling for pagination links in collections:
   * When this state represents an item within a collection and following pagination
   * links (self, first, last, prev, next), we preserve the original item's relation
   * type instead of using the pagination link relation. This ensures that the
   * returned resource maintains the semantic context of the collection item,
   * allowing proper traversal within the collection hierarchy.
   *
   * Example:
   * - Item with rel="item" follows "next" → returns resource with rel="item"
   * - This enables maintaining the item's relationship type while navigating
   */
  follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables,
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      if (
        ['self', 'first', 'last', 'prev', 'next'].includes(link.rel) &&
        this.collection.length > 0
      ) {
        return this.client.go({ ...link, rel: this.init.currentLink.rel });
      }
      const expandedHref = expand(link, variables);
      return this.client.go({ ...link, href: expandedHref });
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  hasActionFor<K extends keyof TEntity['links']>(
    rel: K,
    method?: HttpMethod,
  ): boolean {
    const link = this.links.get(rel as string);
    if (!link) {
      return false;
    }

    const matches = this.forms.filter(
      (f) => f.uri === link.href && (!method || f.method === method),
    );
    return matches.length > 0;
  }

  actionFor<K extends keyof TEntity['links']>(
    rel: K,
    method?: HttpMethod,
  ): Action<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (!link) {
      throw new ActionNotFound(`Link relation '${rel as string}' not found`);
    }

    const matches = this.forms.filter(
      (f) => f.uri === link.href && (!method || f.method === method),
    );

    if (matches.length === 0) {
      throw new ActionNotFound(
        `No action found for link '${rel as string}' (href: ${link.href})`,
      );
    }

    if (matches.length > 1 && !method) {
      throw new AmbiguousActionError(
        `Multiple actions found for '${rel as string}'. ` +
          `Specify method: ${matches.map((f) => f.method).join(', ')}`,
      );
    }

    return new SimpleAction(this.client, matches[0]);
  }

  clone(): State<TEntity> {
    return new BaseState(this.init);
  }
}
