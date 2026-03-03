package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import java.util.Optional;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.TaskModel;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class TaskApi {
  private final Project project;
  private final Task task;

  public TaskApi(Project project, Task task) {
    this.project = project;
    this.task = task;
  }

  @GET
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel get(@Context UriInfo uriInfo) {
    return TaskModel.of(project, task, uriInfo);
  }

  @POST
  @Path("delegate")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel delegate(@Valid DelegateTaskRequest request, @Context UriInfo uriInfo) {
    try {
      String requestId = normalizeRequestId(request.getRequestId());
      if (requestId != null) {
        Optional<Task> replayed =
            Optional.ofNullable(project.tasks().findByDelegateRequestId(requestId))
                .orElse(Optional.empty());
        if (replayed.isPresent()) {
          ensureTaskReplayTarget("delegate", replayed.get(), requestId);
          return TaskModel.of(project, replayed.get(), uriInfo);
        }
      }

      project.delegateTaskForExecution(
          task.getIdentity(),
          new Ref<>(request.getAssigneeId()),
          new Ref<>(request.getCallerAgentId()),
          request.getOccurredAt());
      if (requestId != null) {
        project.tasks().bindDelegateRequestId(task.getIdentity(), requestId);
      }
      return TaskModel.of(project, reloadTask(), uriInfo);
    } catch (IllegalArgumentException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
    } catch (IllegalStateException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.CONFLICT);
    }
  }

  @POST
  @Path("submit-review")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel submitForReview(
      @Valid SubmitTaskForReviewRequest request, @Context UriInfo uriInfo) {
    try {
      project.submitTaskForReview(
          task.getIdentity(),
          new Ref<>(request.getImplementerAgentId()),
          request.getCompletionSummary(),
          request.getOccurredAt());
      return TaskModel.of(project, reloadTask(), uriInfo);
    } catch (IllegalArgumentException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
    } catch (IllegalStateException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.CONFLICT);
    }
  }

  @POST
  @Path("approve")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel approve(@Valid VerifyTaskRequest request, @Context UriInfo uriInfo) {
    try {
      String requestId = normalizeRequestId(request.getRequestId());
      if (requestId != null) {
        Optional<Task> replayed =
            Optional.ofNullable(project.tasks().findByApproveRequestId(requestId))
                .orElse(Optional.empty());
        if (replayed.isPresent()) {
          ensureTaskReplayTarget("approve", replayed.get(), requestId);
          return TaskModel.of(project, replayed.get(), uriInfo);
        }
      }

      project.approveTask(
          task.getIdentity(),
          new Ref<>(request.getReviewerAgentId()),
          request.getVerificationReport(),
          request.getOccurredAt());
      if (requestId != null) {
        project.tasks().bindApproveRequestId(task.getIdentity(), requestId);
      }
      return TaskModel.of(project, reloadTask(), uriInfo);
    } catch (IllegalArgumentException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
    } catch (IllegalStateException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.CONFLICT);
    }
  }

  @POST
  @Path("request-fix")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.TASK)
  public TaskModel requestFix(@Valid VerifyTaskRequest request, @Context UriInfo uriInfo) {
    try {
      project.requestTaskFix(
          task.getIdentity(),
          new Ref<>(request.getReviewerAgentId()),
          request.getVerificationReport(),
          request.getOccurredAt());
      return TaskModel.of(project, reloadTask(), uriInfo);
    } catch (IllegalArgumentException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
    } catch (IllegalStateException e) {
      throw new WebApplicationException(e.getMessage(), Response.Status.CONFLICT);
    }
  }

  private Task reloadTask() {
    Optional<Task> reloaded = project.tasks().findByIdentity(task.getIdentity());
    return reloaded.orElse(task);
  }

  private void ensureTaskReplayTarget(String operation, Task replayedTask, String requestId) {
    if (!task.getIdentity().equals(replayedTask.getIdentity())) {
      throw new WebApplicationException(
          "requestId '%s' was already used for %s on task %s"
              .formatted(requestId, operation, replayedTask.getIdentity()),
          Response.Status.CONFLICT);
    }
  }

  private String normalizeRequestId(String requestId) {
    if (requestId == null) {
      return null;
    }
    String normalized = requestId.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  @Data
  @NoArgsConstructor
  public static class DelegateTaskRequest {
    private String requestId;

    @NotBlank private String assigneeId;
    @NotBlank private String callerAgentId;

    private Instant occurredAt;
  }

  @Data
  @NoArgsConstructor
  public static class SubmitTaskForReviewRequest {
    @NotBlank private String implementerAgentId;
    @NotBlank private String completionSummary;

    private Instant occurredAt;
  }

  @Data
  @NoArgsConstructor
  public static class VerifyTaskRequest {
    private String requestId;

    @NotBlank private String reviewerAgentId;
    @NotBlank private String verificationReport;

    private Instant occurredAt;
  }
}
