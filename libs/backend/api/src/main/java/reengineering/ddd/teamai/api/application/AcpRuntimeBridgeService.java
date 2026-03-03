package reengineering.ddd.teamai.api.application;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.acp.AcpEventEnvelope;
import reengineering.ddd.teamai.api.acp.AcpEventIdGenerator;
import reengineering.ddd.teamai.model.AgentRuntime;

@Component
public class AcpRuntimeBridgeService {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
  private static final Logger log = LoggerFactory.getLogger(AcpRuntimeBridgeService.class);

  private final AgentRuntime runtime;
  private final AcpEventIdGenerator eventIdGenerator;
  private final Map<String, AgentRuntime.SessionHandle> activeHandles = new ConcurrentHashMap<>();
  private final Map<String, CopyOnWriteArrayList<AcpEventEnvelope>> sessionEvents =
      new ConcurrentHashMap<>();

  public AcpRuntimeBridgeService(AgentRuntime runtime, AcpEventIdGenerator eventIdGenerator) {
    this.runtime = runtime;
    this.eventIdGenerator = eventIdGenerator;
  }

  public AgentRuntime.SessionHandle startSession(
      String sessionId, String actorUserId, String goal) {
    return activeHandles.computeIfAbsent(
        sessionId,
        ignored -> {
          AgentRuntime.SessionHandle handle =
              runtime.start(
                  new AgentRuntime.StartRequest(
                      sessionId,
                      actorUserId,
                      goal == null || goal.isBlank() ? "ACP session " + sessionId : goal.trim()));
          appendEvent(
              sessionId,
              AcpEventEnvelope.TYPE_STATUS,
              Map.of(
                  "state", "RUNNING",
                  "runtimeSessionId", handle.sessionId(),
                  "startedAt", handle.startedAt()),
              null);
          log.info(
              "event=acp_runtime_started traceId={} sessionId={} runtimeSessionId={} actorUserId={}",
              traceId(),
              sessionId,
              handle.sessionId(),
              actorUserId);
          return handle;
        });
  }

  public AgentRuntime.SendResult sendPrompt(String sessionId, String prompt, Duration timeout) {
    AgentRuntime.SessionHandle handle = requireHandle(sessionId);
    Duration effectiveTimeout =
        timeout == null || timeout.isNegative() || timeout.isZero() ? DEFAULT_TIMEOUT : timeout;
    try {
      AgentRuntime.SendResult result =
          runtime.send(handle, new AgentRuntime.SendRequest(prompt, effectiveTimeout));
      appendEvent(
          sessionId,
          AcpEventEnvelope.TYPE_DELTA,
          Map.of("content", result.output(), "format", "text", "completedAt", result.completedAt()),
          null);
      appendEvent(
          sessionId,
          AcpEventEnvelope.TYPE_COMPLETE,
          Map.of("reason", "prompt-finished", "completedAt", result.completedAt()),
          null);
      log.info(
          "event=acp_runtime_prompt_succeeded traceId={} sessionId={} completedAt={}",
          traceId(),
          sessionId,
          result.completedAt());
      return result;
    } catch (RuntimeException error) {
      appendEvent(
          sessionId,
          AcpEventEnvelope.TYPE_ERROR,
          Map.of(),
          new AcpEventEnvelope.EventError("RUNTIME_FAILURE", message(error), true, 1000));
      log.warn(
          "event=acp_runtime_prompt_failed traceId={} sessionId={} message={}",
          traceId(),
          sessionId,
          message(error));
      throw error;
    }
  }

  public void cancelSession(String sessionId, String reason) {
    AgentRuntime.SessionHandle handle = activeHandles.remove(sessionId);
    if (handle != null) {
      runtime.stop(handle);
    }
    appendEvent(
        sessionId,
        AcpEventEnvelope.TYPE_COMPLETE,
        Map.of("reason", reason == null || reason.isBlank() ? "cancelled" : reason.trim()),
        null);
    log.info("event=acp_runtime_cancelled traceId={} sessionId={}", traceId(), sessionId);
  }

  public List<AcpEventEnvelope> findEventsSince(String sessionId, String lastEventId) {
    List<AcpEventEnvelope> events =
        sessionEvents.getOrDefault(sessionId, new CopyOnWriteArrayList<>());
    if (lastEventId == null || lastEventId.isBlank()) {
      return List.copyOf(events);
    }
    int index = -1;
    for (int i = 0; i < events.size(); i++) {
      if (lastEventId.equals(events.get(i).eventId())) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return List.copyOf(events);
    }
    if (index + 1 >= events.size()) {
      return List.of();
    }
    return List.copyOf(events.subList(index + 1, events.size()));
  }

  public void appendStatus(String sessionId, Map<String, Object> data) {
    appendEvent(sessionId, AcpEventEnvelope.TYPE_STATUS, data == null ? Map.of() : data, null);
  }

  private AgentRuntime.SessionHandle requireHandle(String sessionId) {
    AgentRuntime.SessionHandle handle = activeHandles.get(sessionId);
    if (handle == null) {
      throw new IllegalStateException("ACP runtime session is not active: " + sessionId);
    }
    return handle;
  }

  private void appendEvent(
      String sessionId, String type, Map<String, Object> data, AcpEventEnvelope.EventError error) {
    String normalizedSessionId =
        sessionId == null || sessionId.isBlank() ? "unknown" : sessionId.trim();
    Map<String, Object> payload = new LinkedHashMap<>();
    if (data != null) {
      payload.putAll(data);
    }
    payload.put("traceId", traceId());
    AcpEventEnvelope envelope =
        new AcpEventEnvelope(
            eventIdGenerator.next(normalizedSessionId, type),
            normalizedSessionId,
            type,
            Instant.now(),
            payload,
            error);
    sessionEvents
        .computeIfAbsent(normalizedSessionId, ignored -> new CopyOnWriteArrayList<>())
        .add(envelope);
  }

  private String message(Throwable error) {
    String message = error == null ? null : error.getMessage();
    return message == null || message.isBlank() ? "runtime failed" : message;
  }

  private String traceId() {
    String traceId = MDC.get("traceId");
    return traceId == null || traceId.isBlank() ? "unknown" : traceId;
  }
}
