import { HalLink } from 'hal-types';

export interface Link extends HalLink {
  rel: string;
}

export class Links<T extends Record<string, any>> {
  private store = new Map<string, Link[]>();

  add(links: Link[]) {
    for (const link of links) {
      if (this.store.has(link.rel)) {
        this.store.get(link.rel)!.push(link);
      } else {
        this.store.set(link.rel, links);
      }
    }
  }

  get(rel: keyof T): Link | undefined {
    if (this.store.has(rel as string)) {
      return this.store.get(rel as string)![0];
    }
    return undefined;
  }
}
