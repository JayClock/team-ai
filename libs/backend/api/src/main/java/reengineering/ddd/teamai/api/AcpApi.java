package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.acp.AcpEventEnvelope;
import reengineering.ddd.teamai.api.acp.AcpSseEventWriter;
import reengineering.ddd.teamai.api.application.AcpRuntimeBridgeService;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;

@Component
@Produces(MediaType.APPLICATION_JSON)
public class AcpApi {
  private static final String JSON_RPC_VERSION = "2.0";
  private static final int ERR_INVALID_REQUEST = -32600;
  private static final int ERR_METHOD_NOT_FOUND = -32601;
  private static final int ERR_INVALID_PARAMS = -32602;
  private static final int ERR_INTERNAL = -32603;
  private static final String METHOD_INITIALIZE = "initialize";
  private static final String METHOD_SESSION_NEW = "session/new";
  private static final String METHOD_SESSION_PROMPT = "session/prompt";
  private static final String METHOD_SESSION_CANCEL = "session/cancel";
  private static final String METHOD_SESSION_LOAD = "session/load";

  @Inject Projects projects;
  @Inject AcpSseEventWriter sseEventWriter;
  @Inject AcpRuntimeBridgeService runtimeBridgeService;

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public JsonRpcResponse rpc(JsonRpcRequest request) {
    if (request == null) {
      return JsonRpcResponse.error(null, ERR_INVALID_REQUEST, "Invalid Request");
    }
    Object id = request.id();
    try {
      validateRequestEnvelope(request);
      Object result =
          dispatch(request.method().trim(), request.params() == null ? Map.of() : request.params());
      return JsonRpcResponse.result(id, result);
    } catch (RpcException error) {
      return JsonRpcResponse.error(id, error.code, error.getMessage());
    } catch (RuntimeException error) {
      return JsonRpcResponse.error(id, ERR_INTERNAL, "Internal error");
    }
  }

  @GET
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void stream(
      @QueryParam("sessionId") String sessionId,
      @HeaderParam("Last-Event-ID") String lastEventId,
      @Context SseEventSink sink,
      @Context Sse sse) {
    if (sink == null) {
      return;
    }
    String resolvedSessionId =
        sessionId == null || sessionId.isBlank() ? "unknown" : sessionId.trim();
    AcpEventEnvelope envelope =
        sseEventWriter.envelope(
            resolvedSessionId,
            AcpEventEnvelope.TYPE_STATUS,
            Map.of("state", "CONNECTED", "transport", "sse"),
            null);
    sseEventWriter.send(sink, sse, envelope);
    runtimeBridgeService
        .findEventsSince(resolvedSessionId, lastEventId)
        .forEach(event -> sseEventWriter.send(sink, sse, event));
    sink.close();
  }

  private void validateRequestEnvelope(JsonRpcRequest request) {
    if (request.jsonrpc() == null || !JSON_RPC_VERSION.equals(request.jsonrpc().trim())) {
      throw new RpcException(ERR_INVALID_REQUEST, "jsonrpc must be '2.0'");
    }
    if (request.method() == null || request.method().isBlank()) {
      throw new RpcException(ERR_INVALID_REQUEST, "method must not be blank");
    }
  }

  private Object dispatch(String method, Map<String, Object> params) {
    return switch (method) {
      case METHOD_INITIALIZE -> initializeResult();
      case METHOD_SESSION_NEW -> sessionNew(params);
      case METHOD_SESSION_PROMPT -> sessionPrompt(params);
      case METHOD_SESSION_CANCEL -> sessionCancel(params);
      case METHOD_SESSION_LOAD -> sessionLoad(params);
      default -> throw new RpcException(ERR_METHOD_NOT_FOUND, "Method not found: " + method);
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

  private Object sessionNew(Map<String, Object> params) {
    String projectId = requireText(params, "projectId");
    String actorUserId = requireText(params, "actorUserId");
    String provider = optionalText(params, "provider").orElse("team-ai");
    String mode = optionalText(params, "mode").orElse("CHAT");
    Instant now = Instant.now();

    Project project = requireProject(projectId);
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
    runtimeBridgeService.startSession(session.getIdentity(), actorUserId, goal);
    return Map.of("session", sessionPayload(session), "accepted", true);
  }

  private Object sessionPrompt(Map<String, Object> params) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    String prompt = requireText(params, "prompt");
    String eventId = optionalText(params, "eventId").orElse(null);
    Instant now = Instant.now();

    Project project = requireProject(projectId);
    AcpSession current = requireSession(project, sessionId);
    if (current.getDescription().status().isTerminal()) {
      throw new RpcException(
          ERR_INVALID_PARAMS,
          "sessionId %s is not active, status=%s"
              .formatted(sessionId, current.getDescription().status().name()));
    }
    if (current.getDescription().status() == AcpSessionDescription.Status.PENDING) {
      project.updateAcpSessionStatus(sessionId, AcpSessionDescription.Status.RUNNING, null, null);
    }
    project.touchAcpSession(sessionId, now, eventId);
    String actorUserId = id(current.getDescription().actor());
    runtimeBridgeService.startSession(
        sessionId, actorUserId == null ? "acp-agent" : actorUserId, "ACP session " + sessionId);
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
    } catch (AgentRuntimeException | IllegalStateException error) {
      throw new RpcException(ERR_INTERNAL, "runtime failed: " + message(error));
    }
  }

  private Object sessionCancel(Map<String, Object> params) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    String reason = optionalText(params, "reason").orElse("cancelled by client");
    Instant now = Instant.now();

    Project project = requireProject(projectId);
    project.updateAcpSessionStatus(sessionId, AcpSessionDescription.Status.CANCELLED, now, reason);
    runtimeBridgeService.cancelSession(sessionId, reason);
    AcpSession updated = requireSession(project, sessionId);
    return Map.of("session", sessionPayload(updated), "cancelled", true);
  }

  private Object sessionLoad(Map<String, Object> params) {
    String projectId = requireText(params, "projectId");
    String sessionId = requireText(params, "sessionId");
    Project project = requireProject(projectId);
    AcpSession session = requireSession(project, sessionId);
    return Map.of("session", sessionPayload(session));
  }

  private Project requireProject(String projectId) {
    return projects
        .findByIdentity(projectId)
        .orElseThrow(
            () -> new RpcException(ERR_INVALID_PARAMS, "projectId not found: " + projectId));
  }

  private AcpSession requireSession(Project project, String sessionId) {
    return project
        .acpSessions()
        .findByIdentity(sessionId)
        .orElseThrow(
            () -> new RpcException(ERR_INVALID_PARAMS, "sessionId not found: " + sessionId));
  }

  private String requireText(Map<String, Object> params, String field) {
    String value = optionalText(params, field).orElse(null);
    if (value == null) {
      throw new RpcException(ERR_INVALID_PARAMS, field + " must not be blank");
    }
    return value;
  }

  private Optional<String> optionalText(Map<String, Object> params, String field) {
    Object value = params.get(field);
    if (value == null) {
      return Optional.empty();
    }
    if (!(value instanceof String text)) {
      throw new RpcException(ERR_INVALID_PARAMS, field + " must be a string");
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
        throw new RpcException(ERR_INVALID_PARAMS, "timeoutMs must be a number");
      }
    } else {
      throw new RpcException(ERR_INVALID_PARAMS, "timeoutMs must be a number");
    }
    if (timeoutMs <= 0) {
      throw new RpcException(ERR_INVALID_PARAMS, "timeoutMs must be greater than 0");
    }
    return Duration.ofMillis(timeoutMs);
  }

  private String message(Throwable error) {
    String message = error == null ? null : error.getMessage();
    return message == null || message.isBlank() ? "runtime failed" : message;
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

  public record JsonRpcError(int code, String message) {}

  public record JsonRpcResponse(String jsonrpc, Object id, Object result, JsonRpcError error) {
    static JsonRpcResponse result(Object id, Object result) {
      return new JsonRpcResponse(JSON_RPC_VERSION, id, result, null);
    }

    static JsonRpcResponse error(Object id, int code, String message) {
      return new JsonRpcResponse(JSON_RPC_VERSION, id, null, new JsonRpcError(code, message));
    }
  }

  private static class RpcException extends RuntimeException {
    private final int code;

    private RpcException(int code, String message) {
      super(message);
      this.code = code;
    }
  }
}
