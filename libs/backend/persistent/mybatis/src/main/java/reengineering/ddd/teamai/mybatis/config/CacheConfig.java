package reengineering.ddd.teamai.mybatis.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import reengineering.ddd.mybatis.support.InjectableObjectFactory;
import reengineering.ddd.teamai.mybatis.cache.GenericEntityHydrator;
import reengineering.ddd.teamai.mybatis.cache.HydratingCacheManager;

@Configuration
@EnableCaching
public class CacheConfig {
  @Bean
  public GenericEntityHydrator genericEntityHydrator(
      ApplicationContext context, @Lazy InjectableObjectFactory objectFactory) {
    return new GenericEntityHydrator(() -> context.getBean(InjectableObjectFactory.class));
  }

  @Bean
  public CacheManager cacheManager(GenericEntityHydrator hydrator) {
    return new HydratingCacheManager(hydrator);
  }
}
