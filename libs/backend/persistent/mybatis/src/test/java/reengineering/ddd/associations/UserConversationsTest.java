package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MybatisTest
@Import(TestContainerConfig.class)
public class UserConversationsTest {
  @Inject
  private Users users;
  private User user;
  private final int conversationCount = 100;

  @BeforeEach
  public void setUp() {
    user = users.createUser(new UserDescription("test", "test"));
    for (var conversation = 0; conversation < conversationCount; conversation++) {
      var description = new ConversationDescription("title");
      user.add(description);
    }
  }

  @Test
  public void should_get_conversations_association_of_user() {
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
    assertEquals(conversation.getDescription().title(), cachedConversation.getDescription().title());
  }

  @Test
  public void should_not_find_conversation_of_user_if_not_exist() {
    assertTrue(user.conversations().findByIdentity("-1").isEmpty());
  }
}
