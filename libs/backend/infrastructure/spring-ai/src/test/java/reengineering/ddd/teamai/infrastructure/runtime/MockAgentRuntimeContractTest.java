package reengineering.ddd.teamai.infrastructure.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;

class MockAgentRuntimeContractTest extends AgentRuntimeContractTest {

  @Override
  protected AgentRuntime createRuntime() {
    return new MockAgentRuntime();
  }

  @Override
  protected AgentRuntime.SendRequest successRequest() {
    return defaultSendRequest("Implement orchestration step");
  }

  @Override
  protected AgentRuntime.SendRequest failureRequest() {
    return defaultSendRequest("Implement orchestration step " + MockAgentRuntime.FAILURE_TRIGGER);
  }

  @Override
  protected AgentRuntime.SendRequest timeoutRequest() {
    return defaultSendRequest("Implement orchestration step " + MockAgentRuntime.TIMEOUT_TRIGGER);
  }

  @Test
  void should_report_down_when_runtime_is_unavailable() {
    MockAgentRuntime runtime = new MockAgentRuntime();
    runtime.setAvailable(false);

    AgentRuntime.Health health = runtime.health();

    assertThat(health.status()).isEqualTo(AgentRuntime.Status.DOWN);
    assertThatThrownBy(() -> runtime.start(validStartRequest()))
        .isInstanceOf(AgentRuntimeException.class)
        .hasMessageContaining("unavailable");
  }
}
