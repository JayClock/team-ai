package reengineering.ddd.teamai.infrastructure.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.infrastructure.runtime.MockAgentRuntime;

class ChatClientConfigTest {

  @Test
  void should_register_mock_agent_runtime() {
    ChatClientConfig config = new ChatClientConfig();

    assertThat(config.agentRuntime()).isInstanceOf(MockAgentRuntime.class);
  }
}
