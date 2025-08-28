export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}
export interface Many<E> {
  items: () => E[];
  pagination: () => Pagination;
  hasPrev: () => boolean;
  hasNext: () => boolean;
  fetchPrev(options?: { signal?: AbortSignal }): Promise<Many<E>>;
  fetchNext(options?: { signal?: AbortSignal }): Promise<Many<E>>;
}
