import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { HeadState, State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { ClientInstance } from '../client-instance.js';
import { entityHeaderNames } from '../http/util.js';
import { SafeAny } from '../archtype/safe-any.js';
import { Resource } from '../index.js';
import { Link, LinkNotFound, LinkVariables } from '../links/link.js';
import { resolve } from '../util/uri.js';
import { expand } from '../util/uri-template.js';
import { Action, ActionNotFound, SimpleAction } from '../action/action.js';
import { freeze } from 'immer';

type HeadStateInit<TEntity extends Entity> = {
  client: ClientInstance;
  links: Links<TEntity['links']>;
  headers: Headers;
  currentLink: Link;
  timestamp?: number;
};

type StateInit<TEntity extends Entity> = {
  forms?: Form[];
  data: TEntity['data'];
  collection?: StateCollection<TEntity>;
  embeddedState?: TEntity['links'];
  isPartial?: boolean;
} & HeadStateInit<TEntity>;

export class BaseHeadState<TEntity extends Entity>
  implements HeadState<TEntity>
{
  readonly uri: string;
  readonly client: ClientInstance;
  readonly links: Links<TEntity['links']>;
  readonly timestamp: number;
  protected readonly headers: Headers;

  constructor(protected init: HeadStateInit<TEntity>) {
    this.uri = resolve(this.init.currentLink);
    this.client = init.client;
    this.links = init.links;
    this.timestamp = init.timestamp ?? Date.now();
    this.headers = init.headers;
  }

  protected warnDeprecatedLink(link: Link): void {
    if (link.hints?.status !== 'deprecated') {
      return;
    }
     
    console.warn(
      `[Resource] The ${link.rel} link on ${this.uri} is marked deprecated.`,
      link,
    );
  }

  hasLink<K extends keyof TEntity['links']>(rel: K): boolean {
    return this.links.has(rel);
  }

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel as string);
  }

  protected isBuffer(data: SafeAny): data is Buffer {
    return typeof Buffer !== 'undefined' && data instanceof Buffer;
  }

  protected isBlob(data: SafeAny): data is Blob {
    return typeof Blob !== 'undefined' && data instanceof Blob;
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
    if (!link) {
      throw new LinkNotFound(
        `Link with rel ${rel as string} on ${this.uri} not found`,
      );
    }
    this.warnDeprecatedLink(link);
    const expandedHref = expand(link, variables);
    return this.client.go({ ...link, href: expandedHref });
  }

  followAll<K extends keyof TEntity['links']>(
    rel: K,
  ): Resource<TEntity['links'][K]>[] {
    return this.links.getMany(rel).map((link) => {
      this.warnDeprecatedLink(link);
      return this.client.go({ ...link });
    });
  }
}

export class BaseState<TEntity extends Entity>
  extends BaseHeadState<TEntity>
  implements State<TEntity>
{
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly isPartial: boolean;
  private readonly forms: Form[];

  constructor(protected override init: StateInit<TEntity>) {
    super(init);
    this.data = freeze(init.data);
    this.isPartial = init.isPartial ?? false;
    this.forms = init.forms ?? [];
    this.collection = init.collection ?? [];
  }

  override hasLink<K extends keyof TEntity['links']>(rel: K): boolean {
    return this.links.has(rel) || this.hasAction(rel);
  }

  serializeBody(): Buffer | Blob | string {
    const data = this.data as SafeAny;
    if (
      this.isBuffer(data) ||
      this.isBlob(data) ||
      typeof data === 'string'
    ) {
      return this.data;
    }
    return JSON.stringify(data);
  }

  override follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables,
  ): Resource<TEntity['links'][K]> {
    if (!this.hasLink(rel)) {
      throw new LinkNotFound(
        `Link with rel ${rel as string} on ${this.uri} not found`,
      );
    }

    const link = this.links.get(rel as string) ?? {
      rel: rel as string,
      href: this.action(rel).uri,
      context: this.client.bookmarkUri,
    };
    this.warnDeprecatedLink(link);

    if (
      ['self', 'first', 'last', 'prev', 'next'].includes(link.rel) &&
      this.collection.length > 0
    ) {
      return this.client.go({ ...link, rel: this.init.currentLink.rel });
    }
    const expandedHref = expand(link, variables);
    return this.client.go({ ...link, href: expandedHref });
  }

  /**
   * Checks if the specified action exists.
   *
   * If no name is given, checks if _any_ action exists.
   */
  private hasAction<K extends keyof TEntity['links']>(name: K): boolean {
    if (name === undefined) return this.forms.length > 0;
    for (const form of this.forms) {
      if (name === form.name) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return an action by name.
   *
   * If no name is given, the first action is returned. This is useful for
   * formats that only supply 1 action, and no name.
   */
  action<K extends keyof TEntity['links']>(
    name: K,
  ): Action<TEntity['links'][K]> {
    if (!this.forms.length) {
      throw new ActionNotFound('This State does not define any actions');
    }

    if (name === undefined) {
      return new SimpleAction<TEntity['links'][K]>(
        this.client,
        this.forms[0],
        this.client.config?.schemaPlugin,
      );
    }

    for (const form of this.forms) {
      if (form.name === name) {
        return new SimpleAction(
          this.client,
          form,
          this.client.config?.schemaPlugin,
        );
      }
    }

    throw new ActionNotFound(
      `This State defines no action with name ${name as string}`,
    );
  }

  clone(): State<TEntity> {
    return new BaseState({
      ...this.init,
      timestamp: this.timestamp,
    });
  }
}
