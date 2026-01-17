import { SafeAny } from '../archtype/safe-any.js';
import { Link, NewLink } from './link.js';

import { resolve } from '../util/uri.js';

/**
 * Container for managing a collection of hypermedia links.
 *
 * Provides methods for adding, retrieving, and querying links by their
 * relation type. Supports multiple links per relation.
 *
 * @typeParam T - Record type defining available link relations
 *
 * @example
 * ```typescript
 * const links = new Links('https://api.example.com/users/123');
 *
 * // Add links
 * links.add('self', '/users/123');
 * links.add({ rel: 'posts', href: '/users/123/posts' });
 *
 * // Query links
 * if (links.has('posts')) {
 *   const postLink = links.get('posts');
 *   console.log(postLink?.href);
 * }
 *
 * // Multiple links with same rel
 * const allItems = links.getMany('item');
 * ```
 *
 * @category Resource
 */
export class Links<T extends Record<string, SafeAny>> {
  private store = new Map<string, Link[]>();

  /**
   * Creates a new Links container.
   *
   * @param defaultContext - Base URI for resolving relative hrefs
   * @param links - Optional initial links to add
   */
  constructor(
    public defaultContext: string,
    links?: (Link | NewLink)[] | Links<T>,
  ) {
    this.store = new Map();

    if (links) {
      if (links instanceof Links) {
        this.add(...links.getAll());
      } else {
        for (const link of links) {
          this.add(link);
        }
      }
    }
  }

  /**
   * Adds one or more links to the container.
   *
   * Multiple links with the same rel are stored as an array.
   *
   * @param links - Link objects to add
   */
  add(...links: NewLink[]): void;
  /**
   * Adds a link with rel and href strings.
   *
   * @param rel - The link relation type
   * @param href - The link target URI
   */
  add(rel: string, href: string): void;
  add(...args: SafeAny[]): void {
    let links: Link[];

    if (typeof args[0] === 'string') {
      links = [
        {
          rel: args[0],
          href: args[1],
          context: this.defaultContext,
        },
      ];
    } else {
      links = args.map((link) => {
        return { context: this.defaultContext, ...link };
      });
    }

    for (const link of links) {
      if (this.store.has(link.rel)) {
        this.store.get(link.rel)?.push(link);
      } else {
        this.store.set(link.rel, [link]);
      }
    }
  }

  /**
   * Returns the first link matching a relation.
   *
   * @param rel - The relation type to find
   * @returns The first matching Link or `undefined`
   */
  get(rel: string): Link | undefined {
    const links = this.store.get(rel);
    if (!links || links.length < 0) {
      return undefined;
    }
    return links[0];
  }

  /**
   * Sets a link, replacing any existing links with the same rel.
   *
   * @param link - The link object to set
   */
  set(link: NewLink): void;
  /**
   * Sets a link using rel and href strings.
   *
   * @param rel - The link relation type
   * @param href - The link target URI
   */
  set(rel: string, href: string): void;
  set(arg1: SafeAny, arg2?: SafeAny): void {
    let link: Link;
    if (typeof arg1 === 'string') {
      link = {
        rel: arg1,
        href: arg2,
        context: this.defaultContext,
      };
    } else {
      link = {
        context: this.defaultContext,
        ...arg1,
      };
    }
    this.store.set(link.rel, [link]);
  }

  /**
   * Deletes links by relation and optionally by href.
   *
   * @param rel - The relation type to delete
   * @param href - Optional href to match; deletes all if not provided
   */
  delete(rel: string, href?: string): void {
    if (href === undefined) {
      this.store.delete(rel);
      return;
    }

    const uris = this.store.get(rel);
    if (!uris) return;

    this.store.delete(rel);
    const absHref = resolve(this.defaultContext, href);
    this.store.set(
      rel,
      uris.filter((uri) => resolve(uri) !== absHref),
    );
  }

  /**
   * Returns all links with a given relation.
   *
   * @param rel - The relation type to find
   * @returns Array of matching Links (empty if none found)
   */
  getMany(rel: keyof T): Link[] {
    return this.store.get(rel as string) || [];
  }

  /**
   * Returns all links in the container.
   *
   * @returns Flat array of all Link objects
   */
  getAll(): Link[] {
    const result = [];
    for (const links of this.store.values()) {
      result.push(...links);
    }
    return result;
  }

  /**
   * Checks if any links exist with the given relation.
   *
   * @param rel - The relation type to check
   * @returns `true` if at least one link exists with the rel
   */
  has(rel: keyof T): boolean {
    return this.store.has(rel as string);
  }
}
