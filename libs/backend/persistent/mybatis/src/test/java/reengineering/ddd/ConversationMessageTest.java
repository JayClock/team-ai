package reengineering.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
public class ConversationMessageTest extends BaseTestContainersTest {
  @Inject
  private Users users;

  Conversation conversation;

  private int messageCount = 100;

  @BeforeEach
  public void setup() {
    User user = users.createUser(new UserDescription("test", "test"));
    conversation = user.add(new ConversationDescription("test"));

    for (var i = 0; i < messageCount; i++) {
      var description = new MessageDescription("role", "content");
      conversation.add(description);
    }
  }

  @Test
  public void should_get_messages_association_of_conversation() {
    assertEquals(messageCount, conversation.getMessages().findAll().size());
  }

  @Test
  public void should_sub_messages_association_of_conversation() {
    assertEquals(40, conversation.getMessages().findAll().subCollection(0, 40).size());
  }

  @Test
  public void should_find_single_message_of_conversation() {
    String identity = conversation.getMessages().findAll().iterator().next().getIdentity();
    Message message = conversation.getMessages().findByIdentity(identity).get();
    assertEquals(identity, message.getIdentity());
  }

  @Test
  public void should_iterate_messages_of_conversation() {
    int count = 0;
    for (var message : conversation.getMessages().findAll()) {
      count++;
    }
    assertEquals(messageCount, count);
  }
}
