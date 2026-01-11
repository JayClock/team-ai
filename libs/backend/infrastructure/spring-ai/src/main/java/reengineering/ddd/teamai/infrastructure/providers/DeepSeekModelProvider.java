package reengineering.ddd.teamai.infrastructure.providers;

import org.springframework.ai.chat.client.ChatClient;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.model.Conversation;

/** DeepSeek model provider implementation */
public class DeepSeekModelProvider implements Conversation.ModelProvider {
  private final ChatClient chatClient;

  public DeepSeekModelProvider(ChatClient chatClient) {
    this.chatClient = chatClient;
  }

  @Override
  public Flux<String> sendMessage(String message) {
    return chatClient.prompt().user(message).stream().content();
  }
}
