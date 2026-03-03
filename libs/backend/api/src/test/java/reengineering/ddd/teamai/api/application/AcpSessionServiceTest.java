package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.api.acp.AcpEventEnvelope;
import reengineering.ddd.teamai.api.acp.AcpEventIdGenerator;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

class AcpSessionServiceTest {
  private AgentRuntime runtime;
  private AcpRuntimeBridgeService service;

  @BeforeEach
  void setUp() {
    runtime = mock(AgentRuntime.class);
    service = new AcpRuntimeBridgeService(runtime, new AcpEventIdGenerator());
  }

  @Test
  void should_start_runtime_once_for_same_session() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-1", "s-1", "user-1", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);

    service.startSession("s-1", "user-1", "goal");
    service.startSession("s-1", "user-1", "goal");

    verify(runtime, times(1)).start(any(AgentRuntime.StartRequest.class));
    List<AcpEventEnvelope> events = service.findEventsSince("s-1", null);
    assertThat(events).hasSize(1);
    assertThat(events.get(0).type()).isEqualTo(AcpEventEnvelope.TYPE_STATUS);
    assertThat(events.get(0).data()).containsEntry("state", "RUNNING");
  }

  @Test
  void should_emit_delta_and_complete_events_when_prompt_succeeds() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-2", "s-2", "user-2", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);
    when(runtime.send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenReturn(
            new AgentRuntime.SendResult("runtime output", Instant.parse("2026-03-03T10:00:02Z")));

    service.startSession("s-2", "user-2", "goal");
    service.sendPrompt("s-2", "hello", Duration.ofSeconds(3));

    List<AcpEventEnvelope> events = service.findEventsSince("s-2", null);
    assertThat(events).hasSize(3);
    assertThat(events.get(1).type()).isEqualTo(AcpEventEnvelope.TYPE_DELTA);
    assertThat(events.get(1).data()).containsEntry("content", "runtime output");
    assertThat(events.get(2).type()).isEqualTo(AcpEventEnvelope.TYPE_COMPLETE);
    assertThat(events.get(2).data()).containsEntry("reason", "prompt-finished");
  }

  @Test
  void should_emit_error_event_when_runtime_times_out() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-3", "s-3", "user-3", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);
    when(runtime.send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenThrow(new AgentRuntimeTimeoutException("timeout"));

    service.startSession("s-3", "user-3", "goal");
    assertThrows(
        AgentRuntimeTimeoutException.class,
        () -> service.sendPrompt("s-3", "hello", Duration.ofMillis(10)));

    List<AcpEventEnvelope> events = service.findEventsSince("s-3", null);
    assertThat(events).hasSize(2);
    AcpEventEnvelope errorEvent = events.get(1);
    assertThat(errorEvent.type()).isEqualTo(AcpEventEnvelope.TYPE_ERROR);
    assertThat(errorEvent.error()).isNotNull();
    assertThat(errorEvent.error().code()).isEqualTo("RUNTIME_TIMEOUT");
    assertThat(errorEvent.error().retryable()).isTrue();
  }

  @Test
  void should_preserve_gateway_error_code_and_retry_semantics() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-3b", "s-3b", "user-3b", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);
    when(runtime.send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenThrow(
            new GatewayAgentRuntimeException(
                "PROVIDER_PROCESS_EXITED", "provider failed", true, 1500, "provider"));

    service.startSession("s-3b", "user-3b", "goal");
    assertThrows(
        AgentRuntimeException.class,
        () -> service.sendPrompt("s-3b", "hello", Duration.ofSeconds(3)));

    List<AcpEventEnvelope> events = service.findEventsSince("s-3b", null);
    AcpEventEnvelope errorEvent = events.get(1);
    assertThat(errorEvent.error()).isNotNull();
    assertThat(errorEvent.error().code()).isEqualTo("PROVIDER_PROCESS_EXITED");
    assertThat(errorEvent.error().retryable()).isTrue();
    assertThat(errorEvent.error().retryAfterMs()).isEqualTo(1500L);
    assertThat(errorEvent.data()).containsEntry("category", "provider");
  }

  @Test
  void should_stop_runtime_and_append_complete_event_on_cancel() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-4", "s-4", "user-4", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);

    service.startSession("s-4", "user-4", "goal");
    service.cancelSession("s-4", "user cancelled");

    verify(runtime, times(1)).stop(handle);
    List<AcpEventEnvelope> events = service.findEventsSince("s-4", null);
    assertThat(events).hasSize(2);
    assertThat(events.get(1).type()).isEqualTo(AcpEventEnvelope.TYPE_COMPLETE);
    assertThat(events.get(1).data()).containsEntry("reason", "user cancelled");
  }

  @Test
  void should_return_events_after_last_event_cursor() {
    AgentRuntime.SessionHandle handle =
        new AgentRuntime.SessionHandle(
            "runtime-s-5", "s-5", "user-5", Instant.parse("2026-03-03T10:00:00Z"));
    when(runtime.start(any(AgentRuntime.StartRequest.class))).thenReturn(handle);

    service.startSession("s-5", "user-5", "goal");
    service.cancelSession("s-5", "cancelled");

    List<AcpEventEnvelope> allEvents = service.findEventsSince("s-5", null);
    List<AcpEventEnvelope> afterFirst = service.findEventsSince("s-5", allEvents.get(0).eventId());
    assertThat(afterFirst).hasSize(1);
    assertThat(afterFirst.get(0).eventId()).isEqualTo(allEvents.get(1).eventId());
  }
}
