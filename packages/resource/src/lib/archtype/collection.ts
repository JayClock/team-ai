import { Entity } from './entity.js';

export type Collection<TEntity extends Entity> = Entity<
  {
    page: {
      size: number;
      totalElements: number;
      totalPages: number;
      number: number;
    };
  },
  {
    first: Collection<TEntity>;
    prev: Collection<TEntity>;
    self: Collection<TEntity>;
    next: Collection<TEntity>;
    last: Collection<TEntity>;
  }
>;
