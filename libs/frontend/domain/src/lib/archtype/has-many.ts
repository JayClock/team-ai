import { Many } from './many.js';

export interface HasMany<E> {
  findAll(options?: { signal?: AbortSignal }): Promise<Many<E>>;
}
