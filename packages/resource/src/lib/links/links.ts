import { SafeAny } from '../archtype/safe-any.js';
import { Link, NewLink } from './link.js';
import { resolve } from '../http/util.js';

/**
 * Links container, providing an easy way to manage a set of links.
 */
export class Links<T extends Record<string, SafeAny>> {
  private store = new Map<string, Link[]>();

  constructor(
    public defaultContext: string,
    links?: (Link | NewLink)[] | Links<T>
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
   * Adds a link to the list
   */
  add(...links: NewLink[]): void;
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
   * Return a single link by its 'rel'.
   *
   * If the link does not exist, undefined is returned.
   */
  get(rel: string): Link | undefined {
    const links = this.store.get(rel);
    if (!links || links.length < 0) {
      return undefined;
    }
    return links[0];
  }

  /**
   * Set a link
   *
   * If a link with the provided 'rel' already existed, it will be overwritten.
   */
  set(link: NewLink): void;
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
   * Delete all links with the given 'rel'.
   *
   * If the second argument is provided, only links that match the href will
   * be removed.
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
      uris.filter((uri) => resolve(uri) !== absHref)
    );
  }

  /**
   * Return all links that have a given rel.
   *
   * If no links with the rel were found, an empty array is returned.
   */
  getMany(rel: keyof T): Link[] {
    return this.store.get(rel as string) || [];
  }

  /**
   * Return all links.
   */
  getAll(): Link[] {
    const result = [];
    for (const links of this.store.values()) {
      result.push(...links);
    }
    return result;
  }

  /**
   * Returns true if at least 1 link with the given rel exists.
   */
  has(rel: keyof T): boolean {
    return this.store.has(rel as string);
  }
}
