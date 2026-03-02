package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.OrchestrationSession;

class OrchestrationRuntimeServiceTest {
  private AgentRuntime runtime;
  private OrchestrationRuntimeService service;

  @BeforeEach
  void setUp() {
    runtime = mock(AgentRuntime.class);
    service = new OrchestrationRuntimeService(runtime);
  }

  @Test
  void should_start_runtime_for_started_session() {
    OrchestrationSession session = session("session-1");
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-session-1",
            "session-1",
            "agent-crafter",
            Instant.parse("2026-03-02T12:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);
    when(runtime.send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenReturn(new AgentRuntime.SendResult("ok", Instant.parse("2026-03-02T12:00:02Z")));

    service.onSessionStarted(session);

    verify(runtime, times(1)).start(any(AgentRuntime.StartRequest.class));
    verify(runtime, times(1))
        .send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class));
    assertThat(service.findHandle("session-1")).contains(handle);
  }

  @Test
  void should_stop_runtime_for_cancelled_session_when_handle_exists() {
    OrchestrationSession session = session("session-1");
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-session-1",
            "session-1",
            "agent-crafter",
            Instant.parse("2026-03-02T12:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);
    when(runtime.send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenReturn(new AgentRuntime.SendResult("ok", Instant.parse("2026-03-02T12:00:02Z")));

    service.onSessionStarted(session);
    service.onSessionCancelled("session-1");

    verify(runtime, times(1)).stop(handle);
    assertThat(service.findHandle("session-1")).isEmpty();
  }

  @Test
  void should_not_call_stop_when_no_handle_exists() {
    service.onSessionCancelled("missing-session");

    verify(runtime, never()).stop(any(AgentRuntime.SessionHandle.class));
  }

  private OrchestrationSession session(String sessionId) {
    return new OrchestrationSession(
        sessionId,
        new OrchestrationSessionDescription(
            "Implement issue",
            OrchestrationSessionDescription.Status.RUNNING,
            new Ref<>("agent-routa"),
            new Ref<>("agent-crafter"),
            new Ref<>("task-1"),
            null,
            Instant.parse("2026-03-02T12:00:00Z"),
            null,
            null));
  }
}
