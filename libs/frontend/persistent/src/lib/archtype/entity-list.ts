import { PageLinks } from './paged-response.js';
import { Pagination } from '@web/domain';
import type { HalLink } from './hal-links.js';

export abstract class EntityList<E> {
  protected _items: E[] = [];
  protected _pageLinks: PageLinks | null = null;
  protected _pagination: Pagination = { total: 0, page: 0, pageSize: 0 };

  public items = () => this._items;
  public pagination = () => this._pagination;

  abstract fetchData(link: HalLink): Promise<void>;
  abstract fetchFirst(): Promise<void>;

  hasPrev(): boolean {
    return !!this._pageLinks?.prev;
  }

  hasNext(): boolean {
    return !!this._pageLinks?.next;
  }

  async fetchPrev(): Promise<void> {
    if (this.hasPrev()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.fetchData(this._pageLinks!.prev);
    }
  }

  async fetchNext(): Promise<void> {
    if (this.hasNext()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.fetchData(this._pageLinks!.next);
    }
  }
}
