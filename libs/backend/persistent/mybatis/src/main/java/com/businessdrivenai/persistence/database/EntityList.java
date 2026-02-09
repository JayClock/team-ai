package com.businessdrivenai.persistence.database;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.archtype.HasMany;
import com.businessdrivenai.archtype.Many;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;

public abstract class EntityList<Id, E extends Entity<Id, ?>> implements Many<E>, HasMany<Id, E> {
  @Override
  public final Many<E> findAll() {
    return this;
  }

  @Override
  public final Optional<E> findByIdentity(Id identifier) {
    return Optional.ofNullable(findEntity(identifier));
  }

  @Override
  public final Many<E> subCollection(int from, int to) {
    return new com.businessdrivenai.persistence.memory.EntityList<>(findEntities(from, to));
  }

  @Override
  public final Iterator<E> iterator() {
    return new BatchIterator();
  }

  private class BatchIterator implements Iterator<E> {

    private Iterator<E> iterator;
    private final int size;
    private int current = 0;

    public BatchIterator() {
      this.size = size();
      this.iterator = nextBatch();
    }

    private Iterator<E> nextBatch() {
      return subCollection(current, Math.min(current + batchSize(), size)).iterator();
    }

    @Override
    public boolean hasNext() {
      return current < size;
    }

    @Override
    public E next() {
      if (!iterator.hasNext()) iterator = nextBatch();
      current++;
      return iterator.next();
    }
  }

  protected int batchSize() {
    return 100;
  }

  protected abstract List<E> findEntities(int from, int to);

  protected abstract E findEntity(Id id);
}
