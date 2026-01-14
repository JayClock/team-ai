package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;

@ExtendWith(MockitoExtension.class)
public class ConversationTest {
  @Mock private Conversation.Messages messages;
  @Mock private Conversation.ModelProvider modelProvider;

  private Conversation conversation;
  private ConversationDescription conversationDescription;
  private MessageDescription userMessage;
  private Message userMessageEntity;
  private Message assistantMessageEntity;
  private String apiKey;

  @BeforeEach
  public void setUp() {
    conversationDescription = new ConversationDescription("Test Conversation");
    conversation = new Conversation("1", conversationDescription, messages);
    userMessage = new MessageDescription("user", "Hello, AI!");
    userMessageEntity = new Message("1", userMessage);
    assistantMessageEntity = new Message("2", new MessageDescription("assistant", "Hello there!"));
    apiKey = "test-api-key";
  }

  @Test
  public void should_return_identity() {
    assertEquals("1", conversation.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(conversationDescription, conversation.getDescription());
    assertEquals("Test Conversation", conversation.getDescription().title());
  }

  @Test
  public void should_return_messages_association() {
    HasMany<String, Message> result = conversation.messages();

    assertSame(messages, result);
  }

  @Test
  public void should_delegate_save_message_to_messages_association() {
    MessageDescription messageDescription = new MessageDescription("user", "Test message");
    Message expectedMessage = new Message("msg-1", messageDescription);
    when(messages.saveMessage(messageDescription)).thenReturn(expectedMessage);

    Message result = conversation.saveMessage(messageDescription);

    assertSame(expectedMessage, result);
    verify(messages).saveMessage(messageDescription);
  }

  @Test
  public void should_save_user_message_and_send_to_model_provider() {
    when(messages.saveMessage(any(MessageDescription.class)))
        .thenAnswer(
            invocation -> {
              MessageDescription desc = invocation.getArgument(0);
              if (desc.role().equals("user")) {
                return userMessageEntity;
              } else {
                return assistantMessageEntity;
              }
            });

    when(modelProvider.sendMessage(userMessage.content(), apiKey))
        .thenReturn(Flux.just("Hello", " there", "!"));

    Flux<String> response = conversation.sendMessage(userMessage, modelProvider, apiKey);

    response.collectList().block();

    verify(messages).saveMessage(userMessage);
    verify(modelProvider).sendMessage(userMessage.content(), apiKey);
  }

  @Test
  public void should_return_streaming_response_from_model_provider() {
    when(messages.saveMessage(any(MessageDescription.class)))
        .thenAnswer(
            invocation -> {
              MessageDescription desc = invocation.getArgument(0);
              if (desc.role().equals("user")) {
                return userMessageEntity;
              } else {
                return assistantMessageEntity;
              }
            });

    when(modelProvider.sendMessage(userMessage.content(), apiKey))
        .thenReturn(Flux.just("Hello", " there", "!"));

    Flux<String> response = conversation.sendMessage(userMessage, modelProvider, apiKey);

    String result = response.collectList().block().stream().reduce("", (a, b) -> a + b);
    assert result.equals("Hello there!");
  }
}
