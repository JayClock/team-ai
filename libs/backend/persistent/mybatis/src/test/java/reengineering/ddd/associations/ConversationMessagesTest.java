package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ConversationMessagesTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private Conversation conversation;
  private final String userId = "1";
  private final int messageCount = 100;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity(userId).get();
    Project project = user.projects().findAll().stream().findFirst().get();
    conversation = project.conversations().findAll().stream().findFirst().get();
  }

  @Test
  public void should_get_messages_association_of_conversation() {
    assertEquals(messageCount, conversation.messages().findAll().size());

    var firstResult = conversation.messages().findAll();
    var secondResult = conversation.messages().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(messageCount, secondResult.size());
  }

  @Test
  public void should_sub_messages_association_of_conversation() {
    assertEquals(40, conversation.messages().findAll().subCollection(0, 40).size());

    var firstResult = conversation.messages().findAll().subCollection(0, 40);
    var secondResult = conversation.messages().findAll().subCollection(0, 40);
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(40, secondResult.size());
  }

  @Test
  public void should_find_single_message_of_conversation() {
    String identity = conversation.messages().findAll().iterator().next().getIdentity();
    Message message = conversation.messages().findByIdentity(identity).get();
    assertEquals(identity, message.getIdentity());

    var cachedMessage = conversation.messages().findByIdentity(identity).get();
    assertEquals(message.getIdentity(), cachedMessage.getIdentity());
    assertEquals(message.getDescription().role(), cachedMessage.getDescription().role());
    assertEquals(message.getDescription().content(), cachedMessage.getDescription().content());
  }

  @Test
  public void should_iterate_messages_of_conversation() {
    int count = 0;
    for (var message : conversation.messages().findAll()) {
      count++;
    }
    assertEquals(messageCount, count);
  }

  @Test
  public void should_save_message_and_return_saved_message() {
    var description = new MessageDescription("user", "Hello, world!");
    Message savedMessage = conversation.saveMessage(description);

    assertEquals("user", savedMessage.getDescription().role());
    assertEquals("Hello, world!", savedMessage.getDescription().content());

    var retrievedMessage = conversation.messages().findByIdentity(savedMessage.getIdentity()).get();
    assertEquals(savedMessage.getIdentity(), retrievedMessage.getIdentity());
    assertEquals(savedMessage.getDescription().role(), retrievedMessage.getDescription().role());
    assertEquals(
        savedMessage.getDescription().content(), retrievedMessage.getDescription().content());
  }
}
