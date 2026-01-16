package reengineering.ddd.teamai.mybatis.cache;

import java.util.List;
import java.util.concurrent.Callable;
import org.springframework.cache.Cache;
import reengineering.ddd.archtype.Entity;

public class HydratingCache implements Cache {

  private final Cache delegate;
  private final GenericEntityHydrator hydrator;

  public HydratingCache(Cache delegate, GenericEntityHydrator hydrator) {
    this.delegate = delegate;
    this.hydrator = hydrator;
  }

  @Override
  public String getName() {
    return delegate.getName();
  }

  @Override
  public Object getNativeCache() {
    return delegate.getNativeCache();
  }

  @Override
  public ValueWrapper get(Object key) {
    ValueWrapper wrapper = delegate.get(key);
    if (wrapper == null) {
      return null;
    }

    Object value = wrapper.get();

    if (hydrator.isCacheEntry(value)) {
      Entity<?, ?> entity = hydrator.hydrate((CacheEntry<?, ?>) value);
      return () -> entity;
    }

    if (hydrator.isCacheEntryList(value)) {
      List<?> entities = hydrator.hydrateList((List<?>) value);
      return () -> entities;
    }

    return wrapper;
  }

  @Override
  @SuppressWarnings("unchecked")
  public <T> T get(Object key, Class<T> type) {
    Object value = delegate.get(key, Object.class);
    if (value == null) {
      return null;
    }

    if (hydrator.isCacheEntry(value)) {
      return (T) hydrator.hydrate((CacheEntry<?, ?>) value);
    }

    if (hydrator.isCacheEntryList(value)) {
      return (T) hydrator.hydrateList((List<?>) value);
    }

    return (T) value;
  }

  @Override
  @SuppressWarnings("unchecked")
  public <T> T get(Object key, Callable<T> valueLoader) {
    return delegate.get(
        key,
        () -> {
          T loaded = valueLoader.call();

          if (hydrator.isEntity(loaded)) {
            return (T) hydrator.extract((Entity<?, ?>) loaded);
          }

          if (hydrator.isEntityList(loaded)) {
            return (T) hydrator.extractList((List<?>) loaded);
          }

          return loaded;
        });
  }

  @Override
  @SuppressWarnings("unchecked")
  public void put(Object key, Object value) {
    if (hydrator.isEntity(value)) {
      delegate.put(key, hydrator.extract((Entity<?, ?>) value));
    } else if (hydrator.isEntityList(value)) {
      delegate.put(key, hydrator.extractList((List<?>) value));
    } else {
      delegate.put(key, value);
    }
  }

  @Override
  public void evict(Object key) {
    delegate.evict(key);
  }

  @Override
  public void clear() {
    delegate.clear();
  }

  @Override
  public boolean evictIfPresent(Object key) {
    return delegate.evictIfPresent(key);
  }

  @Override
  public boolean invalidate() {
    return delegate.invalidate();
  }
}
