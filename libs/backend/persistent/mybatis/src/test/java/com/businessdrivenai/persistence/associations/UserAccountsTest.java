package com.businessdrivenai.persistence.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
public class UserAccountsTest {
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
  public void should_get_accounts_association_of_user() {
    assertEquals(1, user.accounts().findAll().size());

    var firstResult = user.accounts().findAll();
    var secondResult = user.accounts().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(1, secondResult.size());
  }

  @Test
  public void should_find_account_by_user_and_id() {
    String identity = user.accounts().findAll().iterator().next().getIdentity();
    assertEquals(identity, user.accounts().findByIdentity(identity).get().getIdentity());

    var cachedAccount = user.accounts().findByIdentity(identity).get();
    assertEquals(identity, cachedAccount.getIdentity());
  }

  @Test
  public void should_not_find_account_by_user_and_id_if_not_exist() {
    assertTrue(user.accounts().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_preserve_eager_loaded_accounts_after_cache_hydration() {
    // First access - loads from DB and caches
    User firstUser = users.findByIdentity(userId).get();
    int accountCount = firstUser.accounts().findAll().size();
    assertTrue(accountCount > 0, "User should have at least one account");

    // Get account details for later verification
    String accountId = firstUser.accounts().findAll().iterator().next().getIdentity();
    String accountProvider =
        firstUser.accounts().findByIdentity(accountId).get().getDescription().provider();

    // Clear the cache to force re-hydration from cached CacheEntry
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());

    // Second access - should hydrate from cache with nested data intact
    User cachedUser = users.findByIdentity(userId).get();

    // Verify eager-loaded accounts are preserved after hydration
    assertEquals(
        accountCount,
        cachedUser.accounts().findAll().size(),
        "Eager-loaded accounts should be preserved after cache hydration");

    // Verify account data is intact
    var cachedAccount = cachedUser.accounts().findByIdentity(accountId);
    assertTrue(cachedAccount.isPresent(), "Account should be found by identity");
    assertEquals(
        accountProvider,
        cachedAccount.get().getDescription().provider(),
        "Account data should be preserved after hydration");
  }
}
