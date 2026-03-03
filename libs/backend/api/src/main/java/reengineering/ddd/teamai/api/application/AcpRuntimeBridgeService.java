package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
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
import reengineering.ddd.teamai.model.AcpSessionEvent;
import reengineering.ddd.teamai.model.AcpSessionEventStore;
import reengineering.ddd.teamai.model.AgentProtocolGateway;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

@Component
public class AcpRuntimeBridgeService {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
  private static final Logger log = LoggerFactory.getLogger(AcpRuntimeBridgeService.class);
  private static final int DEFAULT_HISTORY_LIMIT = 200;
  private static final int MAX_HISTORY_LIMIT = 1000;

  private final AgentProtocolGateway gateway;
  private final AcpEventIdGenerator eventIdGenerator;
  private final AcpSessionEventStore sessionEventStore;
  private final AcpRuntimeTelemetry telemetry;
  private final Map<String, AgentProtocolGateway.SessionHandle> activeHandles =
      new ConcurrentHashMap<>();
  private final Map<String, CopyOnWriteArrayList<AcpEventEnvelope>> sessionEvents =
      new ConcurrentHashMap<>();
  private final Map<String, String> sessionProjectIds = new ConcurrentHashMap<>();

  @Inject
  public AcpRuntimeBridgeService(
      AgentProtocolGateway gateway,
      AcpEventIdGenerator eventIdGenerator,
      AcpSessionEventStore sessionEventStore,
      AcpRuntimeTelemetry telemetry) {
    this.gateway = gateway;
    this.eventIdGenerator = eventIdGenerator;
    this.sessionEventStore = sessionEventStore;
    this.telemetry = telemetry;
  }

  public AcpRuntimeBridgeService(AgentRuntime runtime, AcpEventIdGenerator eventIdGenerator) {
    this(
        new AgentRuntimeGateway(runtime),
        eventIdGenerator,
        noopEventStore(),
        AcpRuntimeTelemetry.noop());
  }

  public AgentProtocolGateway.SessionHandle startSession(
      String projectId, String sessionId, String actorUserId, String goal) {
    String normalizedProjectId = normalizeProjectId(projectId);
    sessionProjectIds.putIfAbsent(sessionId, normalizedProjectId);
    return activeHandles.computeIfAbsent(
        sessionId,
        ignored -> {
          Instant startedAt = Instant.now();
          try {
            AgentProtocolGateway.SessionHandle handle =
                gateway.start(
                    new AgentProtocolGateway.StartRequest(
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
            telemetry.sessionCreateResult(
                normalizedProjectId,
                sessionId,
                actorUserId,
                "success",
                durationBetween(startedAt, Instant.now()),
                null,
                null);
            log.info(
                "event=acp_runtime_started traceId={} sessionId={} runtimeSessionId={} actorUserId={}",
                traceId(),
                sessionId,
                handle.sessionId(),
                actorUserId);
            return handle;
          } catch (RuntimeException error) {
            RuntimeFailure failure = toRuntimeFailure(error);
            telemetry.sessionCreateResult(
                normalizedProjectId,
                sessionId,
                actorUserId,
                "failure",
                durationBetween(startedAt, Instant.now()),
                failure.category(),
                failure.code());
            throw error;
          }
        });
  }

  public AgentProtocolGateway.SessionHandle startSession(
      String sessionId, String actorUserId, String goal) {
    return startSession("unknown", sessionId, actorUserId, goal);
  }

  public AgentProtocolGateway.SendResult sendPrompt(
      String sessionId, String prompt, Duration timeout) {
    AgentProtocolGateway.SessionHandle handle = requireHandle(sessionId);
    Duration effectiveTimeout =
        timeout == null || timeout.isNegative() || timeout.isZero() ? DEFAULT_TIMEOUT : timeout;
    Instant startedAt = Instant.now();
    try {
      AgentProtocolGateway.SendResult result =
          gateway.send(handle, new AgentProtocolGateway.SendRequest(prompt, effectiveTimeout));
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
      telemetry.promptResult(
          sessionId,
          "success",
          durationBetween(startedAt, result.completedAt()),
          null,
          null,
          false);
      return result;
    } catch (RuntimeException error) {
      RuntimeFailure failure = toRuntimeFailure(error);
      appendEvent(
          sessionId,
          AcpEventEnvelope.TYPE_ERROR,
          Map.of("code", failure.code(), "category", failure.category()),
          new AcpEventEnvelope.EventError(
              failure.code(), failure.message(), failure.retryable(), failure.retryAfterMs()));
      telemetry.promptResult(
          sessionId,
          "failure",
          durationBetween(startedAt, Instant.now()),
          failure.category(),
          failure.code(),
          failure.retryable());
      telemetry.promptErrorDistribution(failure.category(), failure.code(), failure.retryable());
      log.warn(
          "event=acp_runtime_prompt_failed traceId={} sessionId={} code={} category={} message={}",
          traceId(),
          sessionId,
          failure.code(),
          failure.category(),
          failure.message());
      throw error;
    }
  }

  public void cancelSession(String sessionId, String reason) {
    AgentProtocolGateway.SessionHandle handle = activeHandles.remove(sessionId);
    if (handle != null) {
      gateway.stop(handle);
    }
    sessionProjectIds.remove(sessionId);
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

  public List<AcpEventEnvelope> findHistory(
      String projectId, String sessionId, String afterEventId, int limit) {
    String normalizedProjectId = normalizeProjectId(projectId);
    String normalizedSessionId = normalizeSessionId(sessionId);
    String normalizedCursor = blankToNull(afterEventId);
    int max = sanitizeLimit(limit);

    List<AcpSessionEvent> persisted =
        sessionEventStore.findBySession(
            normalizedProjectId, normalizedSessionId, normalizedCursor, max);
    if (!persisted.isEmpty()) {
      return persisted.stream().map(this::toEnvelope).toList();
    }

    List<AcpEventEnvelope> inMemory = findEventsSince(normalizedSessionId, normalizedCursor);
    if (inMemory.size() <= max) {
      return inMemory;
    }
    return List.copyOf(inMemory.subList(0, max));
  }

  public void appendStatus(String sessionId, Map<String, Object> data) {
    appendEvent(sessionId, AcpEventEnvelope.TYPE_STATUS, data == null ? Map.of() : data, null);
  }

  private AgentProtocolGateway.SessionHandle requireHandle(String sessionId) {
    AgentProtocolGateway.SessionHandle handle = activeHandles.get(sessionId);
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
    persistEvent(normalizedSessionId, envelope);
  }

  private void persistEvent(String sessionId, AcpEventEnvelope envelope) {
    String projectId = sessionProjectIds.getOrDefault(sessionId, "unknown");
    AcpSessionEvent event =
        new AcpSessionEvent(
            envelope.eventId(),
            envelope.sessionId(),
            envelope.type(),
            envelope.emittedAt(),
            envelope.data(),
            toDomainError(envelope.error()));
    try {
      sessionEventStore.append(projectId, event);
    } catch (RuntimeException error) {
      log.warn(
          "event=acp_runtime_event_persist_failed traceId={} sessionId={} projectId={} message={}",
          traceId(),
          sessionId,
          projectId,
          message(error));
    }
  }

  private AcpSessionEvent.Error toDomainError(AcpEventEnvelope.EventError error) {
    if (error == null) {
      return null;
    }
    return new AcpSessionEvent.Error(
        error.code(), error.message(), error.retryable(), error.retryAfterMs());
  }

  private AcpEventEnvelope toEnvelope(AcpSessionEvent event) {
    return new AcpEventEnvelope(
        event.eventId(),
        event.sessionId(),
        event.type(),
        event.emittedAt(),
        event.data(),
        toEnvelopeError(event.error()));
  }

  private AcpEventEnvelope.EventError toEnvelopeError(AcpSessionEvent.Error error) {
    if (error == null) {
      return null;
    }
    return new AcpEventEnvelope.EventError(
        error.code(), error.message(), error.retryable(), error.retryAfterMs());
  }

  private String normalizeProjectId(String projectId) {
    if (projectId == null || projectId.isBlank()) {
      return "unknown";
    }
    return projectId.trim();
  }

  private String normalizeSessionId(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return "unknown";
    }
    return sessionId.trim();
  }

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private int sanitizeLimit(int limit) {
    if (limit <= 0) {
      return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(limit, MAX_HISTORY_LIMIT);
  }

  private static AcpSessionEventStore noopEventStore() {
    return new AcpSessionEventStore() {
      @Override
      public void append(String projectId, AcpSessionEvent event) {}

      @Override
      public List<AcpSessionEvent> findBySession(
          String projectId, String sessionId, String afterEventId, int limit) {
        return List.of();
      }
    };
  }

  private String message(Throwable error) {
    String message = error == null ? null : error.getMessage();
    return message == null || message.isBlank() ? "runtime failed" : message;
  }

  private RuntimeFailure toRuntimeFailure(RuntimeException error) {
    String resolvedMessage = message(error);
    if (error instanceof GatewayAgentRuntimeException gatewayError) {
      return new RuntimeFailure(
          gatewayError.code(),
          gatewayError.category(),
          gatewayError.retryable(),
          gatewayError.retryAfterMs(),
          resolvedMessage);
    }
    if (error instanceof AgentRuntimeTimeoutException) {
      return new RuntimeFailure("RUNTIME_TIMEOUT", "runtime", true, 1000, resolvedMessage);
    }
    return new RuntimeFailure("RUNTIME_FAILURE", "runtime", true, 1000, resolvedMessage);
  }

  private Duration durationBetween(Instant startedAt, Instant endedAt) {
    if (startedAt == null || endedAt == null) {
      return Duration.ZERO;
    }
    Duration duration = Duration.between(startedAt, endedAt);
    if (duration.isNegative()) {
      return Duration.ZERO;
    }
    return duration;
  }

  private String traceId() {
    String traceId = MDC.get("traceId");
    return traceId == null || traceId.isBlank() ? "unknown" : traceId;
  }

  private record RuntimeFailure(
      String code, String category, boolean retryable, long retryAfterMs, String message) {}
}
