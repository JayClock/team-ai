package reengineering.ddd.teamai.infrastructure.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.infrastructure.runtime.CodexRuntime;
import reengineering.ddd.teamai.infrastructure.runtime.MockAgentRuntime;

class ChatClientConfigTest {

  @Test
  void should_register_mock_agent_runtime_by_default() {
    ChatClientConfig config = new ChatClientConfig();

    assertThat(config.createAgentRuntime("mock")).isInstanceOf(MockAgentRuntime.class);
    assertThat(config.createAgentRuntime(null)).isInstanceOf(MockAgentRuntime.class);
  }

  @Test
  void should_register_codex_runtime_when_enabled() {
    ChatClientConfig config = new ChatClientConfig();

    assertThat(config.createAgentRuntime("codex")).isInstanceOf(CodexRuntime.class);
  }
}
