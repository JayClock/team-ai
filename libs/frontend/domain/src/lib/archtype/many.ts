export interface Many<E> {
  items: () => E[];
  hasPrev: () => boolean;
  hasNext: () => boolean;
  fetchFirst(): Promise<void>;
}
