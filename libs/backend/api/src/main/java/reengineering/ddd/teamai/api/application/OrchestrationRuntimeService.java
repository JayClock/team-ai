package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;

@Component
public class OrchestrationRuntimeService {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);

  private final AgentRuntime runtime;
  private final Map<String, AgentRuntime.SessionHandle> activeHandles = new ConcurrentHashMap<>();

  @Inject
  public OrchestrationRuntimeService(AgentRuntime runtime) {
    this.runtime = runtime;
  }

  public void onSessionStarted(Project project, OrchestrationSession session, Instant occurredAt) {
    if (project == null) {
      throw new IllegalArgumentException("project must not be null");
    }
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    Instant eventTime = occurredAt == null ? Instant.now() : occurredAt;

    var description = session.getDescription();
    String implementerId =
        Optional.ofNullable(description.implementer())
            .map(reengineering.ddd.archtype.Ref::id)
            .filter(id -> !id.isBlank())
            .orElseThrow(() -> new IllegalArgumentException("implementer must not be blank"));

    AgentRuntime.SessionHandle handle =
        runtime.start(
            new AgentRuntime.StartRequest(
                session.getIdentity(), implementerId, description.goal()));
    activeHandles.put(session.getIdentity(), handle);

    Ref<String> implementer = description.implementer();
    Ref<String> taskRef = description.task();
    try {
      AgentRuntime.SendResult result =
          runtime.send(handle, new AgentRuntime.SendRequest(description.goal(), DEFAULT_TIMEOUT));
      String output = result.output();
      project.reportTask(
          taskRef.id(),
          implementer,
          new TaskReportDescription("Codex runtime output", true, output));
      project.updateTaskStatus(taskRef.id(), TaskDescription.Status.REVIEW_REQUIRED, output);
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.REPORT_SUBMITTED,
              implementer,
              taskRef,
              output,
              eventTime));
      project.updateOrchestrationSessionStatus(
          session.getIdentity(),
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
          description.currentStep(),
          eventTime,
          null);
    } catch (AgentRuntimeException error) {
      String message = error.getMessage() == null ? "Runtime failed" : error.getMessage();
      project.reportTask(
          taskRef.id(),
          implementer,
          new TaskReportDescription("Codex runtime execution failed", false, message));
      project.updateTaskStatus(taskRef.id(), TaskDescription.Status.BLOCKED, message);
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.AGENT_ERROR, implementer, taskRef, message, eventTime));
      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.TASK_FAILED, implementer, taskRef, message, eventTime));
      project.updateOrchestrationSessionStatus(
          session.getIdentity(),
          OrchestrationSessionDescription.Status.FAILED,
          description.currentStep(),
          eventTime,
          message);
      throw error;
    }
  }

  public void onSessionCancelled(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId must not be blank");
    }
    AgentRuntime.SessionHandle handle = activeHandles.remove(sessionId);
    if (handle != null) {
      runtime.stop(handle);
    }
  }

  public Optional<AgentRuntime.SessionHandle> findHandle(String sessionId) {
    return Optional.ofNullable(activeHandles.get(sessionId));
  }
}
