package reengineering.ddd.teamai.infrastructure.config;

import com.businessdrivenai.domain.model.Conversation;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.teamai.infrastructure.providers.DeepSeekModelProvider;

@Configuration
public class ChatClientConfig {
  @Bean
  public Conversation.ModelProvider modelProvider() {
    return new DeepSeekModelProvider();
  }
}
