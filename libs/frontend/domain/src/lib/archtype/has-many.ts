import { Many } from './many.js';

export interface HasMany<E> {
  findAll(options: { page: number; signal?: AbortSignal }): Promise<Many<E>>;
}
