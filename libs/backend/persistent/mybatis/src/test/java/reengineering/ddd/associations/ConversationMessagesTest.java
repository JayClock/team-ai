package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;
import reactor.test.StepVerifier;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@MybatisTest
public class ConversationMessagesTest extends BaseTestContainersTest {
  @Inject
  private Users users;
  @MockitoBean
  private Conversation.ModelProvider modelProvider;

  Conversation conversation;

  private final int messageCount = 100;

  @BeforeEach
  public void setup() {
    User user = users.createUser(new UserDescription("test", "test"));
    conversation = user.add(new ConversationDescription("test"));

    for (var i = 0; i < messageCount; i++) {
      var description = new MessageDescription("role", "content");
      conversation.saveMessage(description);
    }
  }

  @Test
  public void should_get_messages_association_of_conversation() {
    assertEquals(messageCount, conversation.messages().findAll().size());
  }

  @Test
  public void should_sub_messages_association_of_conversation() {
    assertEquals(40, conversation.messages().findAll().subCollection(0, 40).size());
  }

  @Test
  public void should_find_single_message_of_conversation() {
    String identity = conversation.messages().findAll().iterator().next().getIdentity();
    Message message = conversation.messages().findByIdentity(identity).get();
    assertEquals(identity, message.getIdentity());
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
  public void should_send_message_and_receive_response() {
    String aiResponse = "AI response content";

    when(modelProvider.sendMessage("content")).thenReturn(Flux.just(aiResponse));

    Flux<String> result = conversation.sendMessage(new MessageDescription("user", "content"));

    StepVerifier.create(result)
        .expectNext(aiResponse)
        .verifyComplete();

    Message userMessage = conversation.messages().findAll().subCollection(100, 101).stream().toList().stream()
        .findFirst().get();
    assertEquals("user", userMessage.getDescription().role());
    assertEquals("content", userMessage.getDescription().content());

    Message assistantMessage = conversation.messages().findAll().subCollection(101, 102).stream().toList().stream()
        .findFirst().get();
    assertEquals("assistant", assistantMessage.getDescription().role());
    assertEquals("AI response content", assistantMessage.getDescription().content());
  }
}
