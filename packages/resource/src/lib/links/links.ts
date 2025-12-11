import { SafeAny } from '../archtype/safe-any.js';
import { Link } from './link.js';

export class Links<T extends Record<string, SafeAny>> {
  private store = new Map<string, Link[]>();

  add(links: Link[]) {
    for (const link of links) {
      if (this.store.has(link.rel)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.store.get(link.rel)!.push(link);
      } else {
        this.set(link);
      }
    }
  }

  /**
   * Return a single link by its 'rel'.
   *
   * If the link does not exist, undefined is returned.
   */
  get(rel: keyof T): Link | undefined {
    if (this.store.has(rel as string)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.store.get(rel as string)![0];
    }
    return undefined;
  }

  /**
   * Set a link
   *
   * If a link with the provided 'rel' already existed, it will be overwritten.
   */
  set(link: Link): void {
    this.store.set(link.rel, [link]);
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
