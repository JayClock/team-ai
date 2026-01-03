package reengineering.ddd.teamai.model;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ConversationTest {
  @Mock
  private Conversation.Messages messages;
  @Mock
  private Conversation.ModelProvider modelProvider;

  private Conversation conversation;
  private MessageDescription userMessage;
  private Message userMessageEntity;
  private Message assistantMessageEntity;

  @BeforeEach
  public void setUp() {
    conversation = new Conversation("1", new ConversationDescription("Test Conversation"), messages);
    userMessage = new MessageDescription("user", "Hello, AI!");
    userMessageEntity = new Message("1", userMessage);
    assistantMessageEntity = new Message("2", new MessageDescription("assistant", "Hello there!"));
  }

  @Test
  public void should_save_user_message_and_send_to_model_provider() {
    when(messages.saveMessage(any(MessageDescription.class)))
      .thenAnswer(invocation -> {
        MessageDescription desc = invocation.getArgument(0);
        if (desc.role().equals("user")) {
          return userMessageEntity;
        } else {
          return assistantMessageEntity;
        }
      });

    when(modelProvider.sendMessage(userMessage.content()))
      .thenReturn(Flux.just("Hello", " there", "!"));

    Flux<String> response = conversation.sendMessage(userMessage, modelProvider);

    response.collectList().block();

    verify(messages).saveMessage(userMessage);
    verify(modelProvider).sendMessage(userMessage.content());
  }

  @Test
  public void should_save_assistant_response_after_stream_completes() {
    when(messages.saveMessage(any(MessageDescription.class)))
      .thenAnswer(invocation -> {
        MessageDescription desc = invocation.getArgument(0);
        if (desc.role().equals("user")) {
          return userMessageEntity;
        } else {
          return assistantMessageEntity;
        }
      });

    when(modelProvider.sendMessage(userMessage.content()))
      .thenReturn(Flux.just("Hello", " there", "!"));

    Flux<String> response = conversation.sendMessage(userMessage, modelProvider);

    response.collectList().block();

    MessageDescription expectedAssistantMessage = new MessageDescription("assistant", "Hello there!");
    verify(messages).saveMessage(userMessage);
    verify(messages).saveMessage(expectedAssistantMessage);
  }

  @Test
  public void should_return_streaming_response_from_model_provider() {
    when(messages.saveMessage(any(MessageDescription.class)))
      .thenAnswer(invocation -> {
        MessageDescription desc = invocation.getArgument(0);
        if (desc.role().equals("user")) {
          return userMessageEntity;
        } else {
          return assistantMessageEntity;
        }
      });

    when(modelProvider.sendMessage(userMessage.content()))
      .thenReturn(Flux.just("Hello", " there", "!"));

    Flux<String> response = conversation.sendMessage(userMessage, modelProvider);

    String result = response.collectList().block().stream().reduce("", (a, b) -> a + b);
    assert result.equals("Hello there!");
  }
}
