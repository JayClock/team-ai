package reengineering.ddd.teamai.infrastructure.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

class CodexRuntimeTest {

  @Test
  void should_execute_command_and_capture_stdout() {
    CodexRuntime runtime = new CodexRuntime(java.util.List.of("/bin/sh", "-c", "cat"));
    AgentRuntime.SessionHandle session = start(runtime);

    AgentRuntime.SendResult result =
        runtime.send(session, new AgentRuntime.SendRequest("hello codex", Duration.ofSeconds(2)));

    assertThat(result.output()).isEqualTo("hello codex");
  }

  @Test
  void should_throw_runtime_exception_for_non_zero_exit_code() {
    CodexRuntime runtime =
        new CodexRuntime(
            java.util.List.of(
                "/bin/sh", "-c", "cat >/dev/null; echo 'execution failed' >&2; exit 7"));
    AgentRuntime.SessionHandle session = start(runtime);

    assertThatThrownBy(
            () ->
                runtime.send(
                    session, new AgentRuntime.SendRequest("hello codex", Duration.ofSeconds(2))))
        .isInstanceOf(AgentRuntimeException.class)
        .hasMessageContaining("exited with code 7")
        .hasMessageContaining("execution failed");
  }

  @Test
  void should_throw_timeout_exception_when_process_exceeds_timeout() {
    CodexRuntime runtime = new CodexRuntime(java.util.List.of("/bin/sh", "-c", "sleep 2; cat"));
    AgentRuntime.SessionHandle session = start(runtime);

    assertThatThrownBy(
            () ->
                runtime.send(
                    session, new AgentRuntime.SendRequest("hello codex", Duration.ofMillis(100))))
        .isInstanceOf(AgentRuntimeTimeoutException.class)
        .hasMessageContaining("timed out");
  }

  @Test
  void should_stop_session_and_disallow_future_send() {
    CodexRuntime runtime = new CodexRuntime(java.util.List.of("/bin/sh", "-c", "cat"));
    AgentRuntime.SessionHandle session = start(runtime);

    runtime.stop(session);

    assertThatThrownBy(
            () ->
                runtime.send(
                    session, new AgentRuntime.SendRequest("hello codex", Duration.ofSeconds(2))))
        .isInstanceOf(AgentRuntimeException.class)
        .hasMessageContaining("not active");
  }

  private AgentRuntime.SessionHandle start(CodexRuntime runtime) {
    return runtime.start(new AgentRuntime.StartRequest("orch-1", "agent-1", "goal"));
  }
}
