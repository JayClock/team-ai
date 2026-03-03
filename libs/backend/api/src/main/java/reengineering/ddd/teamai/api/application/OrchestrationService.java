package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

@Component
public class OrchestrationService {
  private static final String DEFAULT_ROUTA_NAME = "Routa Coordinator";
  private static final String DEFAULT_CRAFTER_NAME = "Crafter Implementer";
  private static final Set<OrchestrationSessionDescription.Status> CANCELLABLE =
      EnumSet.of(
          OrchestrationSessionDescription.Status.PENDING,
          OrchestrationSessionDescription.Status.RUNNING,
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED);

  private final OrchestrationRuntimeService runtimeService;
  private final int maxRuntimeAttempts;

  @Inject
  public OrchestrationService(
      OrchestrationRuntimeService runtimeService,
      @Value("${team-ai.orchestration.max-runtime-attempts:2}") int maxRuntimeAttempts) {
    this.runtimeService = runtimeService;
    this.maxRuntimeAttempts = Math.max(1, maxRuntimeAttempts);
  }

  public OrchestrationSession start(Project project, StartCommand command) {
    if (project == null) {
      throw new IllegalArgumentException("project must not be null");
    }
    if (command == null) {
      throw new IllegalArgumentException("command must not be null");
    }

    String requestId = normalizeText(command.requestId());
    if (requestId != null) {
      Optional<OrchestrationSession> replayed =
          project.orchestrationSessions().findByStartRequestId(requestId);
      if (replayed.isPresent()) {
        return replayed.get();
      }
    }

    Ref<String> coordinator = ensureCoordinator(project, command.coordinatorAgentId());
    Ref<String> implementer = ensureImplementer(project, command.implementerAgentId());
    Instant occurredAt = command.occurredAt() == null ? Instant.now() : command.occurredAt();

    Task task = project.createTask(toTaskDescription(command));
    Ref<String> taskRef = new Ref<>(task.getIdentity());
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.MESSAGE_SENT,
            coordinator,
            taskRef,
            command.goal(),
            occurredAt));

    project.delegateTaskForExecution(task.getIdentity(), implementer, coordinator, occurredAt);
    OrchestrationSession session =
        project.startOrchestrationSession(
            new OrchestrationSessionDescription(
                command.goal(),
                OrchestrationSessionDescription.Status.RUNNING,
                coordinator,
                implementer,
                taskRef,
                null,
                occurredAt,
                null,
                null));
    if (requestId != null) {
      project.orchestrationSessions().bindStartRequestId(session.getIdentity(), requestId);
    }

    executeWithRetry(project, session, occurredAt);
    return project.orchestrationSessions().findByIdentity(session.getIdentity()).orElse(session);
  }

  public OrchestrationSession cancel(
      Project project, OrchestrationSession session, String reason, Instant occurredAt) {
    if (project == null) {
      throw new IllegalArgumentException("project must not be null");
    }
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    if (reason == null || reason.isBlank()) {
      throw new IllegalArgumentException("reason must not be blank");
    }

    OrchestrationSessionDescription current = session.getDescription();
    if (!CANCELLABLE.contains(current.status())) {
      throw new IllegalStateException("Cannot cancel orchestration in state " + current.status());
    }

    Instant cancelledAt = occurredAt == null ? Instant.now() : occurredAt;
    runtimeService.onSessionCancelled(session.getIdentity());
    project.updateOrchestrationSessionStatus(
        session.getIdentity(),
        OrchestrationSessionDescription.Status.CANCELLED,
        current.currentStep(),
        cancelledAt,
        reason);
    return project.orchestrationSessions().findByIdentity(session.getIdentity()).orElse(session);
  }

  private void executeWithRetry(Project project, OrchestrationSession session, Instant occurredAt) {
    int attempts = 0;
    while (attempts < maxRuntimeAttempts) {
      attempts++;
      try {
        runtimeService.onSessionStarted(project, session, occurredAt);
        return;
      } catch (AgentRuntimeException error) {
        if (attempts >= maxRuntimeAttempts) {
          throw error;
        }
        rollbackForRetry(project, session, occurredAt, attempts + 1, error.getMessage());
      }
    }
  }

  private void rollbackForRetry(
      Project project,
      OrchestrationSession session,
      Instant occurredAt,
      int nextAttempt,
      String reason) {
    OrchestrationSessionDescription description = session.getDescription();
    String taskId = description.task().id();
    Ref<String> implementer = description.implementer();
    String message =
        "Retrying after runtime failure (attempt " + nextAttempt + "): " + normalize(reason);
    project.updateTaskStatus(taskId, TaskDescription.Status.IN_PROGRESS, message);
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            implementer,
            description.task(),
            message,
            occurredAt));
    project.updateOrchestrationSessionStatus(
        session.getIdentity(),
        OrchestrationSessionDescription.Status.RUNNING,
        description.currentStep(),
        null,
        null);
  }

  private TaskDescription toTaskDescription(StartCommand command) {
    return new TaskDescription(
        resolveTitle(command),
        command.goal(),
        normalizeText(command.scope()),
        command.acceptanceCriteria(),
        command.verificationCommands(),
        TaskDescription.Status.PENDING,
        null,
        null,
        null,
        null,
        null);
  }

  private Ref<String> ensureCoordinator(Project project, String explicitAgentId) {
    if (explicitAgentId != null && !explicitAgentId.isBlank()) {
      Agent agent =
          project
              .agents()
              .findByIdentity(explicitAgentId)
              .orElseThrow(
                  () -> new IllegalArgumentException("Coordinator not found: " + explicitAgentId));
      ensureDelegatorRole(agent);
      return new Ref<>(agent.getIdentity());
    }

    Optional<Agent> existing =
        project.agents().findAll().stream()
            .filter(agent -> agent.getDescription().role() == AgentDescription.Role.ROUTA)
            .findFirst();
    if (existing.isPresent()) {
      return new Ref<>(existing.get().getIdentity());
    }

    Agent created =
        project.createAgent(
            new AgentDescription(
                DEFAULT_ROUTA_NAME,
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_CREATED,
            new Ref<>(created.getIdentity()),
            null,
            "Default coordinator agent created by orchestration",
            Instant.now()));
    return new Ref<>(created.getIdentity());
  }

  private Ref<String> ensureImplementer(Project project, String explicitAgentId) {
    if (explicitAgentId != null && !explicitAgentId.isBlank()) {
      Agent agent =
          project
              .agents()
              .findByIdentity(explicitAgentId)
              .orElseThrow(
                  () -> new IllegalArgumentException("Implementer not found: " + explicitAgentId));
      ensureImplementerRole(agent);
      return new Ref<>(agent.getIdentity());
    }

    Optional<Agent> existing =
        project.agents().findAll().stream()
            .filter(agent -> isImplementerRole(agent.getDescription().role()))
            .findFirst();
    if (existing.isPresent()) {
      return new Ref<>(existing.get().getIdentity());
    }

    Agent created =
        project.createAgent(
            new AgentDescription(
                DEFAULT_CRAFTER_NAME,
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_CREATED,
            new Ref<>(created.getIdentity()),
            null,
            "Default implementer agent created by orchestration",
            Instant.now()));
    return new Ref<>(created.getIdentity());
  }

  private boolean isImplementerRole(AgentDescription.Role role) {
    return role == AgentDescription.Role.CRAFTER || role == AgentDescription.Role.DEVELOPER;
  }

  private void ensureImplementerRole(Agent agent) {
    if (!isImplementerRole(agent.getDescription().role())) {
      throw new IllegalStateException(
          "implementer role must be one of [CRAFTER, DEVELOPER], but was "
              + agent.getDescription().role());
    }
  }

  private void ensureDelegatorRole(Agent agent) {
    if (agent.getDescription().role() == AgentDescription.Role.GATE) {
      throw new IllegalStateException(
          "coordinator role must be one of [ROUTA, CRAFTER, DEVELOPER], but was GATE");
    }
  }

  private String resolveTitle(StartCommand command) {
    String explicit = normalizeText(command.title());
    if (explicit != null) {
      return explicit;
    }
    String goal = command.goal().trim();
    return goal.length() <= 120 ? goal : goal.substring(0, 120);
  }

  private String normalizeText(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String normalize(String value) {
    return value == null || value.isBlank() ? "unknown" : value;
  }

  public record StartCommand(
      String requestId,
      String goal,
      String title,
      String scope,
      List<String> acceptanceCriteria,
      List<String> verificationCommands,
      String coordinatorAgentId,
      String implementerAgentId,
      Instant occurredAt) {}
}
