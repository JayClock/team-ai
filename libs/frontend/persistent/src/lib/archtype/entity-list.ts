import { PageLinks } from './paged-response.js';
import { Pagination } from '@web/domain';
import type { HalLink } from './hal-links.js';
import type { Axios } from 'axios';

export abstract class EntityList<E> {
  protected _items: E[] = [];
  protected _pageLinks: PageLinks | null = null;
  protected _pagination: Pagination = { total: 0, page: 0, pageSize: 0 };
  protected abstract axios: Axios;

  public items = () => this._items;
  public pagination = () => this._pagination;

  protected abstract _mapResponseData(data: any): E[];

  async fetchData(link: HalLink): Promise<void> {
    const { data } = await this.axios.get<any>(link.href);

    if (data.page) {
      this._pagination = {
        page: data.page.number,
        pageSize: data.page.size,
        total: data.page.totalElements,
      };
    }
    this._pageLinks = data._links || null;
    this._items = this._mapResponseData(data);
  }

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
