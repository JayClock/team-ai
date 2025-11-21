import { Entity } from "./entity.js";

export interface Collection<TEntity extends Entity> {
  description: {
    page: {
      size: number;
      totalElements: number;
      totalPages: number;
      number: number;
    };
  };
  relations: {
    first: Collection<TEntity>;
    prev: Collection<TEntity>;
    self: Collection<TEntity>;
    next: Collection<TEntity>;
    last: Collection<TEntity>;
  };
}
