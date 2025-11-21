import { HalLink } from 'hal-types';
import { SafeAny } from './archtype/safe-any.js';

export interface Link extends HalLink {
  rel: string;
}

export class Links<T extends Record<string, SafeAny>> {
  private store = new Map<string, Link[]>();

  add(links: Link[]) {
    for (const link of links) {
      if (this.store.has(link.rel)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.store.get(link.rel)!.push(link);
      } else {
        this.store.set(link.rel, links);
      }
    }
  }

  get(rel: keyof T): Link | undefined {
    if (this.store.has(rel as string)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.store.get(rel as string)![0];
    }
    return undefined;
  }
}
