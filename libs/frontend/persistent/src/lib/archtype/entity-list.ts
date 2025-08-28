import { Many, HasMany, Pagination } from '@web/domain';
import { HalLinks } from './hal-links.js';
import { PagedResponse } from './paged-response.js';

export abstract class EntityList<E> implements Many<E>, HasMany<E> {
  protected _items: E[] = [];
  protected _pagination: Pagination = { page: 0, pageSize: 0, total: 0 };
  protected _pageLinks: HalLinks = {};

  items = () => this._items;
  pagination = () => this._pagination;
  hasPrev = () => !!this._pageLinks.prev;
  hasNext = () => !!this._pageLinks.next;

  fetchPrev(options?: { signal?: AbortSignal }): Promise<Many<E>> {
    return this.findAll({
      url: this._pageLinks.pref.href,
      signal: options?.signal,
    });
  }

  fetchNext(options?: { signal?: AbortSignal }): Promise<Many<E>> {
    return this.findAll({
      url: this._pageLinks.next.href,
      signal: options?.signal,
    });
  }

  async findAll(options?: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<Many<E>> {
    const data = await this.fetchEntities(options ?? {});
    this._pageLinks = data._links;
    this._pagination = {
      page: data.page.number,
      pageSize: data.page.size,
      total: data.page.totalElements,
    };
    return {
      items: this.items,
      hasPrev: this.hasPrev,
      hasNext: this.hasNext,
      fetchPrev: this.fetchPrev,
      fetchNext: this.fetchNext,
      pagination: this.pagination,
    };
  }

  abstract fetchEntities(options: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<PagedResponse<unknown>>;
}
