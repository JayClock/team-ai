package reengineering.ddd.teamai.mybatis.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableCaching
public class CacheConfig {

  public static final String CACHE_USERS = "users";
  public static final String CACHE_USER_CONVERSATIONS = "userConversations";
  public static final String CACHE_USER_CONVERSATIONS_LIST = "userConversationsList";
  public static final String CACHE_USER_CONVERSATIONS_COUNT = "userConversationsCount";
  public static final String CACHE_CONVERSATION_MESSAGES = "conversationMessages";
  public static final String CACHE_CONVERSATION_MESSAGES_LIST = "conversationMessagesList";
  public static final String CACHE_CONVERSATION_MESSAGES_COUNT = "conversationMessagesCount";
  public static final String CACHE_USER_ACCOUNTS = "userAccounts";

  @Bean
  public CacheManager cacheManager() {
    CaffeineCacheManager cacheManager = new CaffeineCacheManager();
    cacheManager.setCaffeine(caffeineCacheBuilder());
    cacheManager.setCacheNames(
        List.of(
            CACHE_USERS,
            CACHE_USER_CONVERSATIONS,
            CACHE_USER_CONVERSATIONS_LIST,
            CACHE_USER_CONVERSATIONS_COUNT,
            CACHE_CONVERSATION_MESSAGES,
            CACHE_CONVERSATION_MESSAGES_LIST,
            CACHE_CONVERSATION_MESSAGES_COUNT,
            CACHE_USER_ACCOUNTS));
    return cacheManager;
  }

  private Caffeine<Object, Object> caffeineCacheBuilder() {
    return Caffeine.newBuilder()
        .expireAfterWrite(10, TimeUnit.MINUTES)
        .maximumSize(10_000)
        .recordStats();
  }
}
