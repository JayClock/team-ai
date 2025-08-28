import { Many } from './many.js';

export interface HasManyPaged<E> {
  findAll(options?: { signal?: AbortSignal }): Promise<Many<E>>;
}
