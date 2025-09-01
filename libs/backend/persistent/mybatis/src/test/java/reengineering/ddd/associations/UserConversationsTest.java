package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MybatisTest
public class UserConversationsTest extends BaseTestContainersTest {
  @Inject
  private Users users;
  private User user;
  @MockitoBean
  private DeepSeekChatModel deepSeekChatModel;
  private int conversationCount = 100;

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
  }

  @Test
  public void should_not_find_conversation_of_user_if_not_exist() {
    assertTrue(user.conversations().findByIdentity("-1").isEmpty());
  }
}
