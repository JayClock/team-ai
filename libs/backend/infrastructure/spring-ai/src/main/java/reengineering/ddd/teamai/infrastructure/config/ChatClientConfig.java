package reengineering.ddd.teamai.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.teamai.infrastructure.providers.DeepSeekModelProvider;
import reengineering.ddd.teamai.infrastructure.providers.SpringAIDomainArchitect;
import reengineering.ddd.teamai.infrastructure.runtime.CodexRuntime;
import reengineering.ddd.teamai.infrastructure.runtime.MockAgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Diagram;

@Configuration
public class ChatClientConfig {
  @Bean
  public Conversation.ModelProvider modelProvider() {
    return new DeepSeekModelProvider();
  }

  @Bean
  public Diagram.DomainArchitect domainArchitect() {
    return new SpringAIDomainArchitect();
  }

  @Bean
  public AgentRuntime agentRuntime(
      @org.springframework.beans.factory.annotation.Value("${team-ai.orchestration.runtime:mock}")
          String runtimeType) {
    return createAgentRuntime(runtimeType);
  }

  AgentRuntime createAgentRuntime(String runtimeType) {
    if ("codex".equalsIgnoreCase(runtimeType)) {
      return new CodexRuntime();
    }
    return new MockAgentRuntime();
  }
}
