package com.businessdrivenai.persistence.memory;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.archtype.HasOne;

public class Reference<E extends Entity<?, ?>> implements HasOne<E> {
  private E entity;

  @Override
  public E get() {
    return entity;
  }
}
