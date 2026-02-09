package com.businessdrivenai.persistence.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.FlywayConfig;
import com.businessdrivenai.persistence.TestCacheConfig;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.TestDataSetup;
import com.businessdrivenai.persistence.mybatis.associations.Users;
import com.businessdrivenai.persistence.mybatis.config.CacheConfig;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class UsersTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private final String userId = "1";

  @BeforeEach
  public void setup() {
    // Clear all caches before each test
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity(userId).get();
  }

  @Test
  public void should_find_user_by_id() {
    assertEquals(String.valueOf(userId), user.getIdentity());
    assertEquals("John Smith", user.getDescription().name());
    assertEquals("john.smith@email.com", user.getDescription().email());

    User cachedUser = users.findByIdentity(String.valueOf(userId)).get();
    assertEquals(user.getIdentity(), cachedUser.getIdentity());
    assertEquals(user.getDescription().name(), cachedUser.getDescription().name());
    assertEquals(user.getDescription().email(), cachedUser.getDescription().email());
    assertSame(user, cachedUser, "User should be cached and return same instance");
  }

  @Test
  public void should_not_find_user_if_not_exist() {
    assertTrue(users.findByIdentity("-1").isEmpty());
  }
}
