package reengineering.ddd.teamai.infrastructure.config;

import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.teamai.infrastructure.mcp.TeamAiMcpTools;

@Configuration
public class McpToolConfig {
  @Bean
  public ToolCallbackProvider teamAiToolCallbackProvider(TeamAiMcpTools teamAiMcpTools) {
    return MethodToolCallbackProvider.builder().toolObjects(teamAiMcpTools).build();
  }
}
