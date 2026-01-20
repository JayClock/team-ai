package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import reengineering.ddd.FlywayConfig;
import reengineering.ddd.TestCacheConfig;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataSetup;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

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
    user = users.findById(userId).get();
  }

  @Test
  public void should_find_user_by_id() {
    assertEquals(String.valueOf(userId), user.getIdentity());
    assertEquals("John Smith", user.getDescription().name());
    assertEquals("john.smith@email.com", user.getDescription().email());

    User cachedUser = users.findById(String.valueOf(userId)).get();
    assertEquals(user.getIdentity(), cachedUser.getIdentity());
    assertEquals(user.getDescription().name(), cachedUser.getDescription().name());
    assertEquals(user.getDescription().email(), cachedUser.getDescription().email());
    assertSame(user, cachedUser, "User should be cached and return same instance");
  }

  @Test
  public void should_not_find_user_if_not_exist() {
    assertTrue(users.findById("-1").isEmpty());
  }
}
