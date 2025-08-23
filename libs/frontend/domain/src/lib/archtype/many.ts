export interface Many<E> {
  items: () => E[];

  fetchFirst(): Promise<void>;
}
