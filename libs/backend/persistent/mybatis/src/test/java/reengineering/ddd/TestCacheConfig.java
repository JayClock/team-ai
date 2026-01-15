package reengineering.ddd;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
@EnableCaching
public class TestCacheConfig {

  @Bean
  @Primary
  public CacheManager testCacheManager() {
    return new ConcurrentMapCacheManager(
        "users",
        "userConversations",
        "userConversationsList",
        "userConversationsCount",
        "conversationMessages",
        "conversationMessagesList",
        "conversationMessagesCount",
        "userAccounts");
  }
}
