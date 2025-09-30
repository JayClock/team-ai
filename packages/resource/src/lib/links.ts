import { HalLink } from 'hal-types';

export interface Link extends HalLink {
  rel: string;
}

export class Links {
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

  get(rel: string): Link | undefined {
    if (this.store.has(rel)) {
      return this.store.get('rel')![0];
    }
    return undefined;
  }
}
