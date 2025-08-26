package reengineering.ddd.associations;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import jakarta.inject.Inject;
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

@MybatisTest
public class ConversationMessagesTest extends BaseTestContainersTest {
  @Inject
  private Users users;
  @MockitoBean
  private DeepSeekChatModel deepSeekChatModel;

  Conversation conversation;

  private int messageCount = 100;

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
    ChatResponse chatResponse = new ChatResponse(List.of(
        new Generation(new AssistantMessage(aiResponse))));
    when(deepSeekChatModel.stream(any(Prompt.class))).thenReturn(Flux.just(chatResponse));

    Flux<String> result = conversation.sendMessage(new MessageDescription("user", "content"));

    StepVerifier.create(result)
        .expectNext(aiResponse)
        .verifyComplete();

    Message userMessage = conversation.messages().findAll().subCollection(100, 101).stream().toList().stream()
        .findFirst().get();
    assertEquals(userMessage.getDescription().role(), "user");
    assertEquals(userMessage.getDescription().content(), "content");

    Message assistantMessage = conversation.messages().findAll().subCollection(101, 102).stream().toList().stream()
        .findFirst().get();
    assertEquals(assistantMessage.getDescription().role(), "assistant");
    assertEquals(assistantMessage.getDescription().content(), "AI response content");
  }
}
