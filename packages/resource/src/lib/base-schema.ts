export interface BaseSchema {
  description: Record<string, any>;
  relations: Record<string, BaseSchema>;
}

export interface Collection<TSchema extends BaseSchema> {
  description: {
    page: {
      size: number;
      totalElements: number;
      totalPages: number;
      number: number;
    };
  };
  relations: {
    first: Collection<TSchema>;
    prev: Collection<TSchema>;
    self: Collection<TSchema>;
    next: Collection<TSchema>;
    last: Collection<TSchema>;
  };
}
