package com.businessdrivenai.persistence.mybatis.config;

import com.businessdrivenai.persistence.mybatis.cache.GenericEntityHydrator;
import com.businessdrivenai.persistence.mybatis.cache.HydratingCacheManager;
import com.businessdrivenai.persistence.support.InjectableObjectFactory;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

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
