package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.acp.AcpEventEnvelope;
import reengineering.ddd.teamai.api.acp.AcpProtocolError;
import reengineering.ddd.teamai.api.acp.AcpSseEventWriter;
import reengineering.ddd.teamai.api.application.AcpRuntimeBridgeService;
import reengineering.ddd.teamai.api.config.TraceIdFilter;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;

@Component
@Produces(MediaType.APPLICATION_JSON)
public class AcpApi {
  private static final Logger log = LoggerFactory.getLogger(AcpApi.class);
  private static final String JSON_RPC_VERSION = "2.0";
  private static final String METHOD_INITIALIZE = "initialize";
  private static final String METHOD_SESSION_NEW = "session/new";
  private static final String METHOD_SESSION_PROMPT = "session/prompt";
  private static final String METHOD_SESSION_CANCEL = "session/cancel";
  private static final String METHOD_SESSION_LOAD = "session/load";
  private static final long STREAM_POLL_INTERVAL_MILLIS = 1000;
  private static final int STREAM_HEARTBEAT_TICKS = 10;
  private static final ExecutorService STREAM_EXECUTOR = Executors.newCachedThreadPool();

  @Inject Projects projects;
  @Inject AcpSseEventWriter sseEventWriter;
  @Inject AcpRuntimeBridgeService runtimeBridgeService;

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public JsonRpcResponse rpc(JsonRpcRequest request, @Context SecurityContext securityContext) {
    if (request == null) {
      return JsonRpcResponse.error(null, AcpProtocolError.INVALID_REQUEST, "Invalid Request");
    }
    Object id = request.id();
    String traceId = traceId();
    log.info("event=acp_rpc_received traceId={} method={} id={}", traceId, request.method(), id);
    try {
      validateRequestEnvelope(request);
      Object result =
          dispatch(
              request.method().trim(),
              request.params() == null ? Map.of() : request.params(),
              securityContext);
      log.info("event=acp_rpc_succeeded traceId={} method={} id={}", traceId, request.method(), id);
      return JsonRpcResponse.result(id, attachTraceId(result, traceId));
    } catch (RpcException error) {
      log.warn(
          "event=acp_rpc_failed traceId={} method={} id={} code={} message={}",
          traceId,
          request.method(),
          id,
          error.code,
          error.getMessage());
      return JsonRpcResponse.error(id, error.code, error.getMessage());
    } catch (RuntimeException error) {
      log.error(
          "event=acp_rpc_error traceId={} method={} id={} message={}",
          traceId,
          request.method(),
          id,
          message(error),
          error);
      return JsonRpcResponse.error(id, AcpProtocolError.INTERNAL, "Internal error");
    }
  }

  @GET
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void stream(
      @QueryParam("sessionId") String sessionId,
      @QueryParam("since") String sinceEventId,
      @HeaderParam("Last-Event-ID") String lastEventId,
      @DefaultValue("false") @QueryParam("once") boolean once,
      @Context SseEventSink sink,
      @Context Sse sse) {
    if (sink == null) {
      return;
    }
    String resolvedSessionId = normalizedSessionId(sessionId);
    String resumeCursor = resolveResumeCursor(sinceEventId, lastEventId);
    STREAM_EXECUTOR.submit(() -> streamLoop(resolvedSessionId, resumeCursor, once, sink, sse));
  }

  private void streamLoop(
      String sessionId, String resumeCursor, boolean once, SseEventSink sink, Sse sse) {
    String traceId = traceId();
    String cursor = resumeCursor;
    int ticks = 0;
    try {
      AcpEventEnvelope connectedEnvelope =
          sseEventWriter.envelope(
              sessionId,
              AcpEventEnvelope.TYPE_STATUS,
              streamStatusPayload("CONNECTED", cursor, traceId),
              null);
      sendEnvelope(sink, sse, connectedEnvelope);

      cursor = replayPendingEvents(sessionId, cursor, sink, sse);
      if (once) {
        return;
      }

      while (!sink.isClosed()) {
        Thread.sleep(STREAM_POLL_INTERVAL_MILLIS);
        ticks++;

        cursor = replayPendingEvents(sessionId, cursor, sink, sse);

        if (ticks % STREAM_HEARTBEAT_TICKS == 0) {
          AcpEventEnvelope heartbeat =
              sseEventWriter.envelope(
                  sessionId,
                  AcpEventEnvelope.TYPE_STATUS,
                  streamStatusPayload("HEARTBEAT", cursor, traceId),
                  null);
          sendEnvelope(sink, sse, heartbeat);
        }
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      sendStreamError(sink, sse, sessionId, "STREAM_INTERRUPTED", "SSE stream interrupted");
    } catch (RuntimeException error) {
      sendStreamError(sink, sse, sessionId, "STREAM_FAILURE", message(error));
    } finally {
      if (!sink.isClosed()) {
        sink.close();
      }
    }
  }

  private String replayPendingEvents(String sessionId, String cursor, SseEventSink sink, Sse sse) {
    String latestCursor = cursor;
    List<AcpEventEnvelope> pendingEvents = runtimeBridgeService.findEventsSince(sessionId, cursor);
    for (AcpEventEnvelope event : pendingEvents) {
      sendEnvelope(sink, sse, event);
      latestCursor = event.eventId();
    }
    return latestCursor;
  }

  private void sendEnvelope(SseEventSink sink, Sse sse, AcpEventEnvelope envelope) {
    if (sink.isClosed()) {
      return;
    }
    sseEventWriter.send(sink, sse, envelope);
  }

  private void sendStreamError(
      SseEventSink sink, Sse sse, String sessionId, String code, String errorMessage) {
    if (sink.isClosed()) {
      return;
    }
    AcpEventEnvelope envelope =
        sseEventWriter.envelope(
            sessionId,
            AcpEventEnvelope.TYPE_ERROR,
            Map.of("state", "FAILED", "transport", "sse", "traceId", traceId()),
            new AcpEventEnvelope.EventError(code, errorMessage, true, 1000));
    sendEnvelope(sink, sse, envelope);
  }

  private void validateRequestEnvelope(JsonRpcRequest request) {
    if (request.jsonrpc() == null || !JSON_RPC_VERSION.equals(request.jsonrpc().trim())) {
      throw new RpcException(AcpProtocolError.INVALID_REQUEST, "jsonrpc must be '2.0'");
    }
    if (request.method() == null || request.method().isBlank()) {
      throw new RpcException(AcpProtocolError.INVALID_REQUEST, "method must not be blank");
    }
  }

  private Object dispatch(
      String method, Map<String, Object> params, SecurityContext securityContext) {
    return switch (method) {
      case METHOD_INITIALIZE -> initializeResult();
      case METHOD_SESSION_NEW -> sessionNew(params, securityContext);
      case METHOD_SESSION_PROMPT -> sessionPrompt(params, securityContext);
      case METHOD_SESSION_CANCEL -> sessionCancel(params, securityContext);
      case METHOD_SESSION_LOAD -> sessionLoad(params, securityContext);
      default ->
          throw new RpcException(AcpProtocolError.METHOD_NOT_FOUND, "Method not found: " + method);
    };
  }

  private Object initializeResult() {
    return Map.of(
        "server",
        Map.of("name", "team-ai-acp", "version", "mvp"),
        "capabilities",
        Map.of("session", true, "sse", true),
        "methods",
        List.of(
            METHOD_INITIALIZE,
            METHOD_SESSION_NEW,
            METHOD_SESSION_PROMPT,
            METHOD_SESSION_CANCEL,
            METHOD_SESSION_LOAD));
  }

  private Object sessionNew(Map<String, Object> params, SecurityContext securityContext) {
    String projectId = requireText(params, "projectId");
    String actorUserId = requireText(params, "actorUserId");
    String provider = optionalText(params, "provider").orElse("team-ai");
    String mode = optionalText(params, "mode").orElse("CHAT");
    Instant now = Instant.now();

    Project project = requireProject(projectId);
    authorizeProjectMember(project, actorUserId, securityContext);
    AcpSession session =
        project.startAcpSession(
            new AcpSessionDescription(
                new Ref<>(projectId),
                new Ref<>(actorUserId),
                provider,
                mode,
                AcpSessionDescription.Status.PENDING,
                now,
                now,
                null,
                null,
                null));
    String goal = optionalText(params, "goal").orElse("ACP session " + session.getIdentity());
    runtimeBridgeService.startSession(projectId, session.getIdentity(), actorUserId, goal);
    return Map.of("session", sessionPayload(session), "accepted", true);
  }

  private Object sessionPrompt(Map<String, Object> params, SecurityContext securityContext) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    String prompt = requireText(params, "prompt");
    String eventId = optionalText(params, "eventId").orElse(null);
    Instant now = Instant.now();

    Project project = requireProject(projectId);
    AcpSession current = requireSession(project, sessionId);
    authorizeProjectMember(project, id(current.getDescription().actor()), securityContext);
    if (current.getDescription().status().isTerminal()) {
      throw new RpcException(
          AcpProtocolError.INVALID_PARAMS,
          "sessionId %s is not active, status=%s"
              .formatted(sessionId, current.getDescription().status().name()));
    }
    if (current.getDescription().status() == AcpSessionDescription.Status.PENDING) {
      project.updateAcpSessionStatus(sessionId, AcpSessionDescription.Status.RUNNING, null, null);
    }
    project.touchAcpSession(sessionId, now, eventId);
    String actorUserId = id(current.getDescription().actor());
    runtimeBridgeService.startSession(
        projectId,
        sessionId,
        actorUserId == null ? "acp-agent" : actorUserId,
        "ACP session " + sessionId);
    Duration timeout = timeout(params.get("timeoutMs"));
    try {
      var runtimeResult = runtimeBridgeService.sendPrompt(sessionId, prompt, timeout);
      AcpSession updated = requireSession(project, sessionId);
      return Map.of(
          "session",
          sessionPayload(updated),
          "accepted",
          true,
          "prompt",
          Map.of("content", prompt, "receivedAt", now.toString()),
          "runtime",
          Map.of("output", runtimeResult.output(), "completedAt", runtimeResult.completedAt()));
    } catch (AgentRuntimeTimeoutException error) {
      throw new RpcException(
          AcpProtocolError.RUNTIME_TIMEOUT, "runtime timeout: " + message(error));
    } catch (AgentRuntimeException | IllegalStateException error) {
      throw new RpcException(AcpProtocolError.RUNTIME_FAILED, "runtime failed: " + message(error));
    }
  }

  private Object sessionCancel(Map<String, Object> params, SecurityContext securityContext) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    String reason = optionalText(params, "reason").orElse("cancelled by client");
    Instant now = Instant.now();

    Project project = requireProject(projectId);
    AcpSession current = requireSession(project, sessionId);
    authorizeProjectMember(project, id(current.getDescription().actor()), securityContext);
    project.updateAcpSessionStatus(sessionId, AcpSessionDescription.Status.CANCELLED, now, reason);
    runtimeBridgeService.cancelSession(sessionId, reason);
    AcpSession updated = requireSession(project, sessionId);
    return Map.of("session", sessionPayload(updated), "cancelled", true);
  }

  private Object sessionLoad(Map<String, Object> params, SecurityContext securityContext) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    Project project = requireProject(projectId);
    AcpSession session = requireSession(project, sessionId);
    authorizeProjectMember(project, id(session.getDescription().actor()), securityContext);
    return Map.of("session", sessionPayload(session));
  }

  private Project requireProject(String projectId) {
    return projects
        .findByIdentity(projectId)
        .orElseThrow(
            () ->
                new RpcException(
                    AcpProtocolError.PROJECT_NOT_FOUND, "projectId not found: " + projectId));
  }

  private AcpSession requireSession(Project project, String sessionId) {
    return project
        .acpSessions()
        .findByIdentity(sessionId)
        .orElseThrow(
            () ->
                new RpcException(
                    AcpProtocolError.SESSION_NOT_FOUND, "sessionId not found: " + sessionId));
  }

  private String requireText(Map<String, Object> params, String field) {
    String value = optionalText(params, field).orElse(null);
    if (value == null) {
      throw new RpcException(AcpProtocolError.INVALID_PARAMS, field + " must not be blank");
    }
    return value;
  }

  private Optional<String> optionalText(Map<String, Object> params, String field) {
    Object value = params.get(field);
    if (value == null) {
      return Optional.empty();
    }
    if (!(value instanceof String text)) {
      throw new RpcException(AcpProtocolError.INVALID_PARAMS, field + " must be a string");
    }
    String normalized = text.trim();
    if (normalized.isEmpty()) {
      return Optional.empty();
    }
    return Optional.of(normalized);
  }

  private Duration timeout(Object rawTimeoutMs) {
    if (rawTimeoutMs == null) {
      return null;
    }
    long timeoutMs;
    if (rawTimeoutMs instanceof Number number) {
      timeoutMs = number.longValue();
    } else if (rawTimeoutMs instanceof String text) {
      try {
        timeoutMs = Long.parseLong(text.trim());
      } catch (NumberFormatException error) {
        throw new RpcException(AcpProtocolError.INVALID_PARAMS, "timeoutMs must be a number");
      }
    } else {
      throw new RpcException(AcpProtocolError.INVALID_PARAMS, "timeoutMs must be a number");
    }
    if (timeoutMs <= 0) {
      throw new RpcException(AcpProtocolError.INVALID_PARAMS, "timeoutMs must be greater than 0");
    }
    return Duration.ofMillis(timeoutMs);
  }

  private String message(Throwable error) {
    String message = error == null ? null : error.getMessage();
    return message == null || message.isBlank() ? "runtime failed" : message;
  }

  private String normalizedSessionId(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return "unknown";
    }
    return sessionId.trim();
  }

  private String resolveResumeCursor(String sinceEventId, String lastEventId) {
    String since = blankToNull(sinceEventId);
    if (since != null) {
      return since;
    }
    return blankToNull(lastEventId);
  }

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private Map<String, Object> streamStatusPayload(
      String state, String latestEventId, String traceId) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("state", state);
    payload.put("transport", "sse");
    payload.put("traceId", traceId);
    if (latestEventId != null) {
      payload.put("latestEventId", latestEventId);
    }
    return payload;
  }

  private void authorizeProjectMember(
      Project project, String actorUserId, SecurityContext securityContext) {
    if (actorUserId == null || actorUserId.isBlank()) {
      throw new RpcException(
          AcpProtocolError.FORBIDDEN, "actorUserId is required for authorization");
    }
    if (securityContext == null || securityContext.getUserPrincipal() == null) {
      return;
    }
    String principalId = securityContext.getUserPrincipal().getName();
    if (principalId == null || principalId.isBlank() || !principalId.equals(actorUserId)) {
      throw new RpcException(
          AcpProtocolError.FORBIDDEN, "actorUserId does not match authenticated user");
    }
    Optional<Member> member = project.members().findByIdentity(principalId);
    if (member.isEmpty()) {
      throw new RpcException(
          AcpProtocolError.FORBIDDEN,
          "user %s is not a member of project %s".formatted(principalId, project.getIdentity()));
    }
  }

  private Object attachTraceId(Object result, String traceId) {
    if (result instanceof Map<?, ?> map) {
      Map<String, Object> payload = new LinkedHashMap<>();
      map.forEach((key, value) -> payload.put(String.valueOf(key), value));
      payload.put("traceId", traceId);
      return payload;
    }
    return result;
  }

  private String traceId() {
    String traceId = MDC.get(TraceIdFilter.TRACE_ID_KEY);
    if (traceId == null || traceId.isBlank()) {
      return UUID.randomUUID().toString();
    }
    return traceId;
  }

  private Map<String, Object> sessionPayload(AcpSession session) {
    AcpSessionDescription description = session.getDescription();
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("id", session.getIdentity());
    payload.put("projectId", id(description.project()));
    payload.put("actorUserId", id(description.actor()));
    payload.put("provider", description.provider());
    payload.put("mode", description.mode());
    payload.put("state", description.status().name());
    payload.put("startedAt", description.startedAt());
    payload.put("lastActivityAt", description.lastActivityAt());
    payload.put("completedAt", description.completedAt());
    payload.put("failureReason", description.failureReason());
    payload.put("lastEventId", description.lastEventId());
    return payload;
  }

  private String id(Ref<String> ref) {
    return ref == null ? null : ref.id();
  }

  public record JsonRpcRequest(
      String jsonrpc, String method, Map<String, Object> params, Object id) {}

  public record JsonRpcError(int code, String message, Map<String, Object> meta) {}

  public record JsonRpcResponse(String jsonrpc, Object id, Object result, JsonRpcError error) {
    static JsonRpcResponse result(Object id, Object result) {
      return new JsonRpcResponse(JSON_RPC_VERSION, id, result, null);
    }

    static JsonRpcResponse error(Object id, AcpProtocolError error, String message) {
      return new JsonRpcResponse(
          JSON_RPC_VERSION,
          id,
          null,
          new JsonRpcError(
              error.jsonRpcCode(),
              message,
              Map.of(
                  "acpCode", error.acpCode(),
                  "httpStatus", error.httpStatus(),
                  "retryable", error.retryable())));
    }
  }

  private static class RpcException extends RuntimeException {
    private final AcpProtocolError code;

    private RpcException(AcpProtocolError code, String message) {
      super(message);
      this.code = code;
    }
  }
}
