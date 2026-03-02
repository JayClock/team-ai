package reengineering.ddd.teamai.infrastructure.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

abstract class AgentRuntimeContractTest {

  private AgentRuntime runtime;

  @BeforeEach
  void setUpContractRuntime() {
    runtime = createRuntime();
  }

  @Test
  void should_start_runtime_session() {
    AgentRuntime.SessionHandle session = runtime.start(validStartRequest());

    assertThat(session.sessionId()).isNotBlank();
    assertThat(session.orchestrationId()).isEqualTo("orch-1");
    assertThat(session.agentId()).isEqualTo("agent-1");
    assertThat(runtime.health().status()).isEqualTo(AgentRuntime.Status.UP);
    assertThat(runtime.health().activeSessions()).isEqualTo(1);
  }

  @Test
  void should_send_message_successfully() {
    AgentRuntime.SessionHandle session = runtime.start(validStartRequest());

    AgentRuntime.SendResult result = runtime.send(session, successRequest());

    assertThat(result.output()).isNotBlank();
    assertThat(result.completedAt()).isNotNull();
  }

  @Test
  void should_report_runtime_failure_with_meaningful_error() {
    AgentRuntime.SessionHandle session = runtime.start(validStartRequest());

    assertThatThrownBy(() -> runtime.send(session, failureRequest()))
        .isInstanceOf(AgentRuntimeException.class)
        .hasMessageContaining("failure");
  }

  @Test
  void should_surface_timeout_exception() {
    AgentRuntime.SessionHandle session = runtime.start(validStartRequest());

    assertThatThrownBy(() -> runtime.send(session, timeoutRequest()))
        .isInstanceOf(AgentRuntimeTimeoutException.class)
        .hasMessageContaining("timed out");
  }

  @Test
  void should_stop_session_and_reflect_health() {
    AgentRuntime.SessionHandle session = runtime.start(validStartRequest());

    runtime.stop(session);

    assertThat(runtime.health().activeSessions()).isEqualTo(0);
    assertThatThrownBy(() -> runtime.send(session, successRequest()))
        .isInstanceOf(AgentRuntimeException.class)
        .hasMessageContaining("not active");
  }

  protected AgentRuntime.StartRequest validStartRequest() {
    return new AgentRuntime.StartRequest("orch-1", "agent-1", "Implement issue");
  }

  protected AgentRuntime.SendRequest defaultSendRequest(String input) {
    return new AgentRuntime.SendRequest(input, Duration.ofSeconds(5));
  }

  protected abstract AgentRuntime createRuntime();

  protected abstract AgentRuntime.SendRequest successRequest();

  protected abstract AgentRuntime.SendRequest failureRequest();

  protected abstract AgentRuntime.SendRequest timeoutRequest();
}
