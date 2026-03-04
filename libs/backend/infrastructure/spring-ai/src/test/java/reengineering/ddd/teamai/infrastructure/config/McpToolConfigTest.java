package reengineering.ddd.teamai.infrastructure.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;
import reengineering.ddd.teamai.infrastructure.mcp.TeamAiMcpTools;
import reengineering.ddd.teamai.model.Projects;

class McpToolConfigTest {

  @Test
  void should_register_all_team_ai_mcp_tools() {
    McpToolConfig config = new McpToolConfig();
    TeamAiMcpTools tools = new TeamAiMcpTools(mock(Projects.class));

    ToolCallbackProvider provider = config.teamAiToolCallbackProvider(tools);
    List<String> toolNames =
        List.of(provider.getToolCallbacks()).stream()
            .map(ToolCallback::getToolDefinition)
            .map(definition -> definition.name())
            .toList();

    assertThat(toolNames)
        .contains(
            "list_projects",
            "list_agents",
            "create_agent",
            "list_tasks",
            "create_task",
            "delegate_task_to_agent",
            "submit_task_for_review",
            "approve_task",
            "request_task_fix",
            "list_agent_events");
    assertThat(toolNames)
        .doesNotContain(
            "start_orchestration",
            "get_orchestration",
            "list_orchestrations",
            "cancel_orchestration",
            "list_orchestration_steps",
            "get_orchestration_step",
            "advance_orchestration_step",
            "cancel_orchestration_step");
  }
}
