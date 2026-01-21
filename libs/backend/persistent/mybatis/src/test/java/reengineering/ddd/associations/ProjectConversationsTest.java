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
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectConversationsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private Project project;
  private final String userId = "1";
  private final int conversationCount = 100;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findById(userId).get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  public void should_get_conversations_association_of_project() {
    assertEquals(conversationCount, project.conversations().findAll().size());

    var firstResult = project.conversations().findAll();
    var secondResult = project.conversations().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(conversationCount, secondResult.size());
  }

  @Test
  public void should_sub_conversations_association_of_project() {
    assertEquals(40, project.conversations().findAll().subCollection(0, 40).size());

    var firstResult = project.conversations().findAll().subCollection(0, 40);
    var secondResult = project.conversations().findAll().subCollection(0, 40);
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(40, secondResult.size());
  }

  @Test
  public void should_find_single_conversation_of_project() {
    String identity = project.conversations().findAll().iterator().next().getIdentity();
    Conversation conversation = project.conversations().findByIdentity(identity).get();
    assertEquals(identity, conversation.getIdentity());

    var cachedConversation = project.conversations().findByIdentity(identity).get();
    assertEquals(conversation.getIdentity(), cachedConversation.getIdentity());
    assertEquals(
        conversation.getDescription().title(), cachedConversation.getDescription().title());
  }

  @Test
  public void should_not_find_conversation_by_project_and_id_if_not_exist() {
    assertTrue(project.conversations().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_conversations_association() {
    assertEquals(conversationCount, project.conversations().findAll().size());

    var cachedSize = project.conversations().findAll().size();
    assertEquals(conversationCount, cachedSize);
  }

  @Test
  public void should_iterate_conversations_of_project() {
    int count = 0;
    for (var conversation : project.conversations().findAll()) {
      count++;
    }
    assertEquals(conversationCount, count);
  }

  @Test
  public void should_add_conversation_and_return_saved_conversation() {
    var description = new ConversationDescription("New Conversation");
    Conversation savedConversation = project.add(description);

    assertEquals("New Conversation", savedConversation.getDescription().title());

    var retrievedConversation =
        project.conversations().findByIdentity(savedConversation.getIdentity()).get();
    assertEquals(savedConversation.getIdentity(), retrievedConversation.getIdentity());
    assertEquals(
        savedConversation.getDescription().title(), retrievedConversation.getDescription().title());
  }

  @Test
  public void should_cache_conversation_list_by_range() {
    var firstCall = project.conversations().findAll().subCollection(0, 20);
    var secondCall = project.conversations().findAll().subCollection(0, 20);

    assertEquals(firstCall.size(), secondCall.size());
    assertEquals(20, secondCall.size());
  }

  @Test
  public void should_cache_conversation_count() {
    int firstCall = project.conversations().findAll().size();
    int secondCall = project.conversations().findAll().size();

    assertEquals(firstCall, secondCall);
    assertEquals(conversationCount, secondCall);
  }

  @Test
  public void should_evict_cache_on_add_conversation() {
    int initialSize = project.conversations().findAll().size();
    assertEquals(conversationCount, initialSize);

    var description = new ConversationDescription("New Conversation");
    project.add(description);

    int newSize = project.conversations().findAll().size();
    assertEquals(conversationCount + 1, newSize);
  }

  @Test
  public void should_delete_conversation() {
    String conversationId = project.conversations().findAll().iterator().next().getIdentity();
    int initialSize = project.conversations().findAll().size();

    project.deleteConversation(conversationId);

    int newSize = project.conversations().findAll().size();
    assertEquals(initialSize - 1, newSize);

    assertTrue(project.conversations().findByIdentity(conversationId).isEmpty());
  }

  @Test
  public void should_evict_cache_on_delete_conversation() {
    String conversationId = project.conversations().findAll().iterator().next().getIdentity();
    int initialSize = project.conversations().findAll().size();

    var cachedConversation = project.conversations().findByIdentity(conversationId);
    assertTrue(cachedConversation.isPresent());

    project.deleteConversation(conversationId);

    assertTrue(project.conversations().findByIdentity(conversationId).isEmpty());

    int newSize = project.conversations().findAll().size();
    assertEquals(initialSize - 1, newSize);
  }
}
