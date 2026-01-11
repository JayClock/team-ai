package reengineering.ddd.teamai.infrastructure.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.teamai.infrastructure.providers.DeepSeekModelProvider;
import reengineering.ddd.teamai.model.Conversation;

@Configuration
public class ChatClientConfig {
  @Bean
  public ChatClient deepSeekChatClient(DeepSeekChatModel chatModel) {
    return ChatClient.create(chatModel);
  }

  @Bean
  public Conversation.ModelProvider modelProvider(ChatClient deepSeekChatClient) {
    return new DeepSeekModelProvider(deepSeekChatClient);
  }
}
