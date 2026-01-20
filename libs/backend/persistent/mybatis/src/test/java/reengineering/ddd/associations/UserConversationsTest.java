package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class UserConversationsTest {
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
  public void should_get_conversations_association_of_user() {
    int conversationCount = 100;
    assertEquals(conversationCount, user.conversations().findAll().size());

    var firstResult = user.conversations().findAll();
    var secondResult = user.conversations().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(conversationCount, secondResult.size());
  }

  @Test
  public void should_sub_conversations_association_of_user() {
    assertEquals(10, user.conversations().findAll().subCollection(10, 20).size());
  }

  @Test
  public void should_find_single_conversation_by_of_user() {
    String identity = user.conversations().findAll().iterator().next().getIdentity();
    Conversation conversation = user.conversations().findByIdentity(identity).get();
    assertEquals(identity, conversation.getIdentity());

    Conversation cachedConversation = user.conversations().findByIdentity(identity).get();
    assertEquals(conversation.getIdentity(), cachedConversation.getIdentity());
    assertEquals(
        conversation.getDescription().title(), cachedConversation.getDescription().title());
  }

  @Test
  public void should_not_find_conversation_of_user_if_not_exist() {
    assertTrue(user.conversations().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_delete_conversation_of_user() {
    // Get the first conversation
    String identity = user.conversations().findAll().iterator().next().getIdentity();
    int initialCount = user.conversations().findAll().size();

    // Verify it exists before deletion
    assertTrue(user.conversations().findByIdentity(identity).isPresent());

    // Delete the conversation
    user.deleteConversation(identity);

    // Verify it no longer exists - need to get fresh user to avoid cache
    User freshUser = users.findById(userId).get();
    assertTrue(freshUser.conversations().findByIdentity(identity).isEmpty());
    assertEquals(initialCount - 1, freshUser.conversations().findAll().size());
  }
}
