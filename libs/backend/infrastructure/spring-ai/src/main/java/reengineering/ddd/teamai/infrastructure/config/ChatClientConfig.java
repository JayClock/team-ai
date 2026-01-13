package reengineering.ddd.teamai.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.teamai.infrastructure.providers.DeepSeekModelProvider;
import reengineering.ddd.teamai.model.Conversation;

@Configuration
public class ChatClientConfig {
  @Bean
  public Conversation.ModelProvider modelProvider() {
    return new DeepSeekModelProvider();
  }
}
