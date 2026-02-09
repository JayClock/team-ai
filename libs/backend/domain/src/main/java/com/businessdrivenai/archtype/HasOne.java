package com.businessdrivenai.archtype;

public interface HasOne<E extends Entity<?, ?>> {
  E get();
}
