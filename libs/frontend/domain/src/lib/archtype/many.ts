export interface Many<E> {
  items: () => E[];

  fetchFirst(): Promise<Many<E>>;
}
