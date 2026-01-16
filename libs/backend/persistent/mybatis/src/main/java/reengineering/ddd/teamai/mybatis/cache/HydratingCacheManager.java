package reengineering.ddd.teamai.mybatis.cache;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;

public class HydratingCacheManager implements CacheManager {

  private final GenericEntityHydrator hydrator;
  private final ConcurrentMap<String, Cache> cacheMap = new ConcurrentHashMap<>();
  private final Caffeine<Object, Object> cacheBuilder;

  public HydratingCacheManager(GenericEntityHydrator hydrator) {
    this.hydrator = hydrator;
    this.cacheBuilder =
        Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(10_000)
            .recordStats();
  }

  @Override
  public Cache getCache(String name) {
    return cacheMap.computeIfAbsent(name, this::createHydratingCache);
  }

  @Override
  public Collection<String> getCacheNames() {
    return cacheMap.keySet();
  }

  private Cache createHydratingCache(String name) {
    com.github.benmanes.caffeine.cache.Cache<Object, Object> nativeCache = cacheBuilder.build();
    CaffeineCache caffeineCache = new CaffeineCache(name, nativeCache);
    return new HydratingCache(caffeineCache, hydrator);
  }
}
