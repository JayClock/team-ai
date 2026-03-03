package reengineering.ddd.teamai.api;

import static reengineering.ddd.teamai.validation.DomainValidation.requireText;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;

@Component
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class A2aGatewayApi {
  private static final Logger log = LoggerFactory.getLogger(A2aGatewayApi.class);
  private static final String TASK_FORWARD_TYPE = "TASK_FORWARD";
  private static final int DEFAULT_TIMEOUT_MS = 5000;
  private static final int DEFAULT_RETRY_LIMIT = 1;
  private static final int MAX_RETRY_LIMIT = 3;
  private static final int RETRY_BACKOFF_MS = 100;

  @Inject Projects projects;

  @Value("${team-ai.a2a.shared-token:team-ai-a2a-dev-token}")
  String sharedToken;

  @POST
  @Path("forward")
  public Response forward(
      @Valid ForwardRequest request, @HeaderParam("X-A2A-Token") String providedToken) {
    String traceId = ensureTraceId();
    long startedAtNanos = System.nanoTime();
    String requestId = requestId(request);

    if (providedToken == null
        || providedToken.isBlank()
        || !providedToken.equals(sharedToken == null ? "" : sharedToken)) {
      return errorResponse(
          Response.Status.UNAUTHORIZED,
          requestId,
          traceId,
          "A2A_AUTH_FAILED",
          "invalid gateway token",
          false,
          0,
          auditContext(request, 0, elapsedMillis(startedAtNanos)));
    }

    try {
      Project project = requireProject(request.getProjectId());
      requireProjectMembership(project, request.getActorUserId());
      validateTaskForwardRequest(request);

      return forwardWithRetry(request, project, traceId, startedAtNanos);
    } catch (BadRequestException error) {
      return errorResponse(
          Response.Status.BAD_REQUEST,
          requestId,
          traceId,
          "A2A_PROTOCOL_INVALID",
          normalizeMessage(error.getMessage(), "invalid request payload"),
          false,
          0,
          auditContext(request, 0, elapsedMillis(startedAtNanos)));
    } catch (WebApplicationException error) {
      Response.Status status = toStatus(error);
      return errorResponse(
          status,
          requestId,
          traceId,
          errorCodeForStatus(status),
          normalizeMessage(error.getMessage(), "request rejected"),
          false,
          0,
          auditContext(request, 0, elapsedMillis(startedAtNanos)));
    }
  }

  private Response forwardWithRetry(
      ForwardRequest request, Project project, String traceId, long startedAtNanos) {
    int timeoutMs = normalizeTimeout(request.getTimeoutMs());
    int retryLimit = normalizeRetryLimit(request.getRetryLimit());
    int attempts = 0;
    RuntimeException lastRuntimeError = null;

    while (attempts <= retryLimit) {
      attempts++;
      long elapsedMs = elapsedMillis(startedAtNanos);
      if (elapsedMs > timeoutMs) {
        return errorResponse(
            Response.Status.GATEWAY_TIMEOUT,
            request.getRequestId(),
            traceId,
            "A2A_TIMEOUT",
            "forwarding timed out after %sms".formatted(timeoutMs),
            true,
            RETRY_BACKOFF_MS,
            auditContext(request, attempts, elapsedMs));
      }

      try {
        Instant now = Instant.now();
        TaskForwardPayload payload = request.getPayload();
        project.delegateTaskForExecution(
            payload.getTaskId(),
            new Ref<>(payload.getAssigneeAgentId()),
            new Ref<>(payload.getCallerAgentId()),
            now);
        AgentEvent forwardedEvent =
            project.appendEvent(
                new AgentEventDescription(
                    AgentEventDescription.Type.TASK_ASSIGNED,
                    new Ref<>(payload.getCallerAgentId()),
                    new Ref<>(payload.getTaskId()),
                    "A2A forward %s -> project %s task %s"
                        .formatted(
                            request.getSourceInstance(),
                            request.getProjectId(),
                            payload.getTaskId()),
                    now));

        long elapsed = elapsedMillis(startedAtNanos);
        log.info(
            "event=a2a_forward_success traceId={} requestId={} source={} projectId={} taskId={} attempts={} latencyMs={}",
            traceId,
            request.getRequestId(),
            request.getSourceInstance(),
            request.getProjectId(),
            payload.getTaskId(),
            attempts,
            elapsed);
        return Response.ok(
                new ForwardResult(
                    traceId,
                    request.getRequestId(),
                    "SUCCESS",
                    new AcpEnvelope(
                        "response",
                        "TASK_FORWARD_ACK",
                        payload.getTaskId(),
                        new AckPayload(
                            request.getProjectId(),
                            payload.getTaskId(),
                            payload.getAssigneeAgentId(),
                            attempts),
                        now),
                    new AcpEnvelope(
                        "event",
                        "TASK_ASSIGNED",
                        forwardedEvent.getIdentity(),
                        new EventPayload(
                            request.getProjectId(),
                            payload.getTaskId(),
                            payload.getCallerAgentId(),
                            payload.getAssigneeAgentId(),
                            request.getSourceInstance()),
                        now),
                    null,
                    auditContext(request, attempts, elapsed)))
            .build();
      } catch (IllegalArgumentException error) {
        throw new BadRequestException(error.getMessage());
      } catch (IllegalStateException error) {
        return errorResponse(
            Response.Status.CONFLICT,
            request.getRequestId(),
            traceId,
            "A2A_ROUTE_REJECTED",
            normalizeMessage(error.getMessage(), "forwarding rejected"),
            false,
            0,
            auditContext(request, attempts, elapsedMillis(startedAtNanos)));
      } catch (RuntimeException error) {
        lastRuntimeError = error;
        if (attempts > retryLimit) {
          break;
        }
        sleepRetryBackoff();
      }
    }

    String message =
        normalizeMessage(
            lastRuntimeError == null ? null : lastRuntimeError.getMessage(), "forwarding failed");
    return errorResponse(
        Response.Status.BAD_GATEWAY,
        request.getRequestId(),
        traceId,
        "A2A_FORWARD_FAILED",
        message,
        true,
        RETRY_BACKOFF_MS,
        auditContext(request, attempts, elapsedMillis(startedAtNanos)));
  }

  private Project requireProject(String projectId) {
    if (projectId == null || projectId.isBlank()) {
      throw new BadRequestException("projectId must not be blank");
    }
    return projects
        .findByIdentity(projectId)
        .orElseThrow(() -> new WebApplicationException("Project not found: " + projectId, 404));
  }

  private void requireProjectMembership(Project project, String actorUserId) {
    if (actorUserId == null || actorUserId.isBlank()) {
      throw new BadRequestException("actorUserId must not be blank");
    }
    Optional<Member> member = project.members().findByIdentity(actorUserId);
    if (member.isEmpty()) {
      throw new WebApplicationException(
          "User %s is not a member of project %s".formatted(actorUserId, project.getIdentity()),
          Response.Status.FORBIDDEN);
    }
  }

  private void validateTaskForwardRequest(ForwardRequest request) {
    if (!TASK_FORWARD_TYPE.equals(request.getMessageType())) {
      throw new BadRequestException(
          "messageType must be TASK_FORWARD, but was " + request.getMessageType());
    }
    TaskForwardPayload payload = request.getPayload();
    if (payload == null) {
      throw new BadRequestException("payload must not be null");
    }
    validateRequiredText(payload.getTaskId(), "payload.taskId");
    validateRequiredText(payload.getAssigneeAgentId(), "payload.assigneeAgentId");
    validateRequiredText(payload.getCallerAgentId(), "payload.callerAgentId");
  }

  private void validateRequiredText(String value, String fieldName) {
    try {
      requireText(value, fieldName);
    } catch (IllegalArgumentException error) {
      throw new BadRequestException(error.getMessage());
    }
  }

  private int normalizeTimeout(Integer timeoutMs) {
    if (timeoutMs == null || timeoutMs < 100) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(timeoutMs, 60000);
  }

  private int normalizeRetryLimit(Integer retryLimit) {
    if (retryLimit == null || retryLimit < 0) {
      return DEFAULT_RETRY_LIMIT;
    }
    return Math.min(retryLimit, MAX_RETRY_LIMIT);
  }

  private long elapsedMillis(long startedAtNanos) {
    return (System.nanoTime() - startedAtNanos) / 1_000_000L;
  }

  private void sleepRetryBackoff() {
    try {
      Thread.sleep(RETRY_BACKOFF_MS);
    } catch (InterruptedException interruptedException) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("retry interrupted", interruptedException);
    }
  }

  private String ensureTraceId() {
    String traceId = MDC.get("traceId");
    if (traceId == null || traceId.isBlank()) {
      traceId = UUID.randomUUID().toString();
      MDC.put("traceId", traceId);
    }
    return traceId;
  }

  private String requestId(ForwardRequest request) {
    return request == null ? null : request.getRequestId();
  }

  private AuditContext auditContext(ForwardRequest request, int attempts, long latencyMs) {
    if (request == null) {
      return new AuditContext(null, null, null, null, attempts, latencyMs, Instant.now());
    }
    return request.auditContext(attempts, latencyMs);
  }

  private Response.Status toStatus(WebApplicationException error) {
    Response response = error.getResponse();
    if (response == null) {
      return Response.Status.BAD_REQUEST;
    }
    Response.Status status = Response.Status.fromStatusCode(response.getStatus());
    return status == null ? Response.Status.BAD_REQUEST : status;
  }

  private String errorCodeForStatus(Response.Status status) {
    return switch (status) {
      case FORBIDDEN -> "A2A_FORBIDDEN";
      case NOT_FOUND -> "A2A_PROJECT_NOT_FOUND";
      case CONFLICT -> "A2A_ROUTE_REJECTED";
      case UNAUTHORIZED -> "A2A_AUTH_FAILED";
      default -> "A2A_REQUEST_REJECTED";
    };
  }

  private String normalizeMessage(String message, String fallback) {
    if (message == null || message.isBlank()) {
      return fallback;
    }
    return message;
  }

  private Response errorResponse(
      Response.Status status,
      String requestId,
      String traceId,
      String code,
      String message,
      boolean retryable,
      long retryAfterMs,
      AuditContext auditContext) {
    log.warn(
        "event=a2a_forward_error traceId={} requestId={} code={} message={} retryable={}",
        traceId,
        requestId,
        code,
        message,
        retryable);
    return Response.status(status)
        .entity(
            new ForwardResult(
                traceId,
                requestId,
                "ERROR",
                null,
                null,
                new ProtocolError(code, message, retryable, retryAfterMs),
                auditContext))
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class ForwardRequest {
    @NotBlank private String protocolVersion;
    @NotBlank private String requestId;
    @NotBlank private String sourceInstance;
    @NotBlank private String actorUserId;
    @NotBlank private String projectId;
    @NotBlank private String messageType;
    @NotNull private TaskForwardPayload payload;
    private Integer timeoutMs;
    private Integer retryLimit;

    private AuditContext auditContext(int attempts, long latencyMs) {
      return new AuditContext(
          sourceInstance, actorUserId, projectId, messageType, attempts, latencyMs, Instant.now());
    }
  }

  @Data
  @NoArgsConstructor
  public static class TaskForwardPayload {
    @NotBlank private String taskId;
    @NotBlank private String assigneeAgentId;
    @NotBlank private String callerAgentId;
    private String note;
  }

  public record ForwardResult(
      String traceId,
      String requestId,
      String status,
      AcpEnvelope response,
      AcpEnvelope event,
      ProtocolError error,
      AuditContext audit) {}

  public record AcpEnvelope(
      String kind, String type, String id, Object payload, Instant occurredAt) {}

  public record AckPayload(String projectId, String taskId, String assigneeAgentId, int attempts) {}

  public record EventPayload(
      String projectId,
      String taskId,
      String callerAgentId,
      String assigneeAgentId,
      String sourceInstance) {}

  public record ProtocolError(String code, String message, boolean retryable, long retryAfterMs) {}

  public record AuditContext(
      String sourceInstance,
      String actorUserId,
      String projectId,
      String messageType,
      int attempts,
      long latencyMs,
      Instant occurredAt) {}
}
