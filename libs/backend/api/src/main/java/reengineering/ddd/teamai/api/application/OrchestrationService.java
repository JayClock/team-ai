package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import java.time.Duration;
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
import reengineering.ddd.teamai.description.OrchestrationStepDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskSpecDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.OrchestrationStep;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

@Component
public class OrchestrationService {
  private static final String DEFAULT_COORDINATOR_NAME = "Coordinator Agent";
  private static final String DEFAULT_IMPLEMENTER_NAME = "Crafter Implementer";
  private static final Set<OrchestrationSessionDescription.Status> CANCELLABLE =
      EnumSet.of(
          OrchestrationSessionDescription.Status.PENDING,
          OrchestrationSessionDescription.Status.RUNNING,
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED);

  private final OrchestrationRuntimeService runtimeService;
  private final int maxRuntimeAttempts;
  private final long retryBackoffMillis;
  private final OrchestrationTelemetry telemetry;

  public OrchestrationService(OrchestrationRuntimeService runtimeService, int maxRuntimeAttempts) {
    this.runtimeService = runtimeService;
    this.maxRuntimeAttempts = Math.max(1, maxRuntimeAttempts);
    this.retryBackoffMillis = 0L;
    this.telemetry = OrchestrationTelemetry.noop();
  }

  @Inject
  public OrchestrationService(
      OrchestrationRuntimeService runtimeService,
      @Value("${team-ai.orchestration.max-runtime-attempts:2}") int maxRuntimeAttempts,
      @Value("${team-ai.orchestration.retry-backoff-millis:0}") long retryBackoffMillis,
      OrchestrationTelemetry telemetry) {
    this.runtimeService = runtimeService;
    this.maxRuntimeAttempts = Math.max(1, maxRuntimeAttempts);
    this.retryBackoffMillis = Math.max(0L, retryBackoffMillis);
    this.telemetry = telemetry == null ? OrchestrationTelemetry.noop() : telemetry;
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
    TaskSpecDescription spec = requireSpec(command.spec());
    Instant occurredAt = command.occurredAt() == null ? Instant.now() : command.occurredAt();

    Task task = project.createTask(toTaskDescription(command, spec));
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
                spec,
                null,
                occurredAt,
                null,
                null));
    if (requestId != null) {
      project.orchestrationSessions().bindStartRequestId(session.getIdentity(), requestId);
    }

    telemetry.sessionTransition(
        session.getIdentity(),
        task.getIdentity(),
        implementer.id(),
        OrchestrationSessionDescription.Status.PENDING.name(),
        OrchestrationSessionDescription.Status.RUNNING.name(),
        "orchestration started");

    List<OrchestrationStep> steps = createStepPlan(project, session, spec, taskRef, implementer);
    executePlannedSteps(project, session, steps, occurredAt);

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
    telemetry.sessionTransition(
        session.getIdentity(),
        current.task() == null ? null : current.task().id(),
        current.implementer() == null ? null : current.implementer().id(),
        current.status().name(),
        OrchestrationSessionDescription.Status.CANCELLED.name(),
        reason);
    return project.orchestrationSessions().findByIdentity(session.getIdentity()).orElse(session);
  }

  private List<OrchestrationStep> createStepPlan(
      Project project,
      OrchestrationSession session,
      TaskSpecDescription spec,
      Ref<String> taskRef,
      Ref<String> implementer) {
    List<StepPlan> plans = buildStepPlan(spec);
    for (int i = 0; i < plans.size(); i++) {
      StepPlan step = plans.get(i);
      project
          .orchestrationSessions()
          .createStep(
              session.getIdentity(),
              i + 1,
              new OrchestrationStepDescription(
                  step.title(),
                  step.objective(),
                  OrchestrationStepDescription.Status.PENDING,
                  taskRef,
                  implementer,
                  null,
                  null,
                  null));
    }
    return project.orchestrationSessions().findSteps(session.getIdentity());
  }

  private List<StepPlan> buildStepPlan(TaskSpecDescription spec) {
    return spec.steps().stream().map(step -> new StepPlan(step.title(), step.objective())).toList();
  }

  private void executePlannedSteps(
      Project project,
      OrchestrationSession session,
      List<OrchestrationStep> steps,
      Instant occurredAt) {
    if (steps == null || steps.size() < 3) {
      throw new IllegalStateException("orchestration requires at least 3 planned steps");
    }

    for (int index = 0; index < steps.size(); index++) {
      OrchestrationStep step = steps.get(index);
      executeStepWithRetry(project, session, step, index + 1, steps.size(), occurredAt);
    }

    OrchestrationStep lastStep = steps.get(steps.size() - 1);
    Ref<String> lastStepRef = new Ref<>(lastStep.getIdentity());
    project.updateOrchestrationSessionStatus(
        session.getIdentity(),
        OrchestrationSessionDescription.Status.COMPLETED,
        lastStepRef,
        Instant.now(),
        null);
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_COMPLETED,
            session.getDescription().implementer(),
            session.getDescription().task(),
            "Orchestration completed with " + steps.size() + " steps",
            occurredAt));
    telemetry.sessionTransition(
        session.getIdentity(),
        session.getDescription().task().id(),
        session.getDescription().implementer().id(),
        OrchestrationSessionDescription.Status.REVIEW_REQUIRED.name(),
        OrchestrationSessionDescription.Status.COMPLETED.name(),
        "all orchestration steps completed");
  }

  private void executeStepWithRetry(
      Project project,
      OrchestrationSession session,
      OrchestrationStep step,
      int sequenceNo,
      int totalSteps,
      Instant occurredAt) {
    Ref<String> stepRef = new Ref<>(step.getIdentity());
    int attempts = 0;
    while (attempts < maxRuntimeAttempts) {
      attempts++;
      Instant stepRuntimeStartedAt = Instant.now();
      Instant startedAt = attempts == 1 ? Instant.now() : null;
      project
          .orchestrationSessions()
          .updateStepStatus(
              session.getIdentity(),
              step.getIdentity(),
              OrchestrationStepDescription.Status.RUNNING,
              startedAt,
              null,
              null);
      project.updateOrchestrationSessionStatus(
          session.getIdentity(),
          OrchestrationSessionDescription.Status.RUNNING,
          stepRef,
          null,
          null);
      project.updateTaskStatus(
          taskId(step, session),
          TaskDescription.Status.IN_PROGRESS,
          "Executing orchestration step "
              + sequenceNo
              + "/"
              + totalSteps
              + ": "
              + step.getDescription().title());
      appendStepEvent(
          project,
          session,
          step,
          AgentEventDescription.Type.TASK_STATUS_CHANGED,
          "Step " + sequenceNo + " started (attempt " + attempts + ")",
          occurredAt);

      OrchestrationSession executionSession = sessionWithCurrentStep(session, stepRef);
      try {
        runtimeService.onSessionStarted(project, executionSession, occurredAt);
        project
            .orchestrationSessions()
            .updateStepStatus(
                session.getIdentity(),
                step.getIdentity(),
                OrchestrationStepDescription.Status.COMPLETED,
                null,
                Instant.now(),
                null);
        appendStepEvent(
            project,
            session,
            step,
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            "Step " + sequenceNo + " completed",
            occurredAt);
        telemetry.stepTransition(
            session.getIdentity(),
            step.getIdentity(),
            taskId(step, session),
            assigneeId(step, session),
            OrchestrationStepDescription.Status.COMPLETED.name());
        telemetry.stepDuration(
            session.getIdentity(),
            step.getIdentity(),
            taskId(step, session),
            assigneeId(step, session),
            "success",
            safeDuration(stepRuntimeStartedAt, Instant.now()));
        return;
      } catch (AgentRuntimeException error) {
        if (attempts >= maxRuntimeAttempts) {
          String reason = normalize(error.getMessage());
          project
              .orchestrationSessions()
              .updateStepStatus(
                  session.getIdentity(),
                  step.getIdentity(),
                  OrchestrationStepDescription.Status.FAILED,
                  null,
                  Instant.now(),
                  reason);
          project.updateOrchestrationSessionStatus(
              session.getIdentity(),
              OrchestrationSessionDescription.Status.FAILED,
              stepRef,
              Instant.now(),
              reason);
          appendStepEvent(
              project,
              session,
              step,
              AgentEventDescription.Type.TASK_FAILED,
              "Step " + sequenceNo + " failed after " + attempts + " attempts: " + reason,
              occurredAt);
          telemetry.stepTransition(
              session.getIdentity(),
              step.getIdentity(),
              taskId(step, session),
              assigneeId(step, session),
              OrchestrationStepDescription.Status.FAILED.name());
          telemetry.stepDuration(
              session.getIdentity(),
              step.getIdentity(),
              taskId(step, session),
              assigneeId(step, session),
              "failed",
              safeDuration(stepRuntimeStartedAt, Instant.now()));
          telemetry.sessionTransition(
              session.getIdentity(),
              taskId(step, session),
              assigneeId(step, session),
              OrchestrationSessionDescription.Status.RUNNING.name(),
              OrchestrationSessionDescription.Status.FAILED.name(),
              reason);
          throw error;
        }

        int nextAttempt = attempts + 1;
        rollbackForRetry(
            project, session, step, sequenceNo, nextAttempt, occurredAt, error.getMessage());
        telemetry.stepDuration(
            session.getIdentity(),
            step.getIdentity(),
            taskId(step, session),
            assigneeId(step, session),
            "retry",
            safeDuration(stepRuntimeStartedAt, Instant.now()));
        telemetry.runtimeRetry(
            session.getIdentity(),
            taskId(step, session),
            assigneeId(step, session),
            nextAttempt,
            error.getMessage());
        sleepForBackoff(nextAttempt);
      }
    }
  }

  private void rollbackForRetry(
      Project project,
      OrchestrationSession session,
      OrchestrationStep step,
      int sequenceNo,
      int nextAttempt,
      Instant occurredAt,
      String reason) {
    OrchestrationSessionDescription description = session.getDescription();
    String message =
        "Rollback step "
            + sequenceNo
            + " for retry attempt "
            + nextAttempt
            + ": "
            + normalize(reason);
    project
        .orchestrationSessions()
        .updateStepStatus(
            session.getIdentity(),
            step.getIdentity(),
            OrchestrationStepDescription.Status.PENDING,
            null,
            null,
            null);
    project.updateTaskStatus(taskId(step, session), TaskDescription.Status.IN_PROGRESS, message);
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            description.implementer(),
            description.task(),
            message,
            occurredAt));
    project.updateOrchestrationSessionStatus(
        session.getIdentity(),
        OrchestrationSessionDescription.Status.RUNNING,
        new Ref<>(step.getIdentity()),
        null,
        null);
  }

  private void sleepForBackoff(int attempt) {
    if (retryBackoffMillis <= 0) {
      return;
    }
    long delay = retryBackoffMillis * Math.max(1, attempt - 1L);
    try {
      Thread.sleep(delay);
    } catch (InterruptedException interruptedException) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(
          "Interrupted while waiting for orchestration retry", interruptedException);
    }
  }

  private void appendStepEvent(
      Project project,
      OrchestrationSession session,
      OrchestrationStep step,
      AgentEventDescription.Type type,
      String message,
      Instant occurredAt) {
    OrchestrationSessionDescription description = session.getDescription();
    project.appendEvent(
        new AgentEventDescription(
            type,
            step.getDescription().assignee() == null
                ? description.implementer()
                : step.getDescription().assignee(),
            step.getDescription().task() == null
                ? description.task()
                : step.getDescription().task(),
            message,
            occurredAt));
  }

  private String taskId(OrchestrationStep step, OrchestrationSession session) {
    Ref<String> task = step.getDescription().task();
    if (task != null && task.id() != null && !task.id().isBlank()) {
      return task.id();
    }
    return session.getDescription().task().id();
  }

  private String assigneeId(OrchestrationStep step, OrchestrationSession session) {
    Ref<String> assignee = step.getDescription().assignee();
    if (assignee != null && assignee.id() != null && !assignee.id().isBlank()) {
      return assignee.id();
    }
    return session.getDescription().implementer().id();
  }

  private OrchestrationSession sessionWithCurrentStep(
      OrchestrationSession source, Ref<String> currentStep) {
    OrchestrationSessionDescription description = source.getDescription();
    return new OrchestrationSession(
        source.getIdentity(),
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.RUNNING,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            currentStep,
            description.startedAt(),
            description.completedAt(),
            description.failureReason()));
  }

  private TaskDescription toTaskDescription(StartCommand command, TaskSpecDescription spec) {
    return new TaskDescription(
        resolveTitle(command),
        command.goal(),
        "spec:" + spec.version(),
        spec.acceptanceCriteria(),
        spec.verificationCommands(),
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
                DEFAULT_COORDINATOR_NAME,
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null,
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
                DEFAULT_IMPLEMENTER_NAME,
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null,
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
    return role == AgentDescription.Role.CRAFTER
        || role == AgentDescription.Role.DEVELOPER
        || role == AgentDescription.Role.SPECIALIST;
  }

  private void ensureImplementerRole(Agent agent) {
    if (!isImplementerRole(agent.getDescription().role())) {
      throw new IllegalStateException(
          "implementer role must be one of [CRAFTER, DEVELOPER, SPECIALIST], but was "
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

  private Duration safeDuration(Instant startedAt, Instant endedAt) {
    if (startedAt == null || endedAt == null) {
      return Duration.ZERO;
    }
    Duration duration = Duration.between(startedAt, endedAt);
    return duration.isNegative() ? Duration.ZERO : duration;
  }

  private TaskSpecDescription requireSpec(TaskSpecDescription spec) {
    if (spec == null) {
      throw new IllegalArgumentException("spec must not be null");
    }
    if (spec.steps().size() < 3) {
      throw new IllegalArgumentException("spec.steps must contain at least 3 steps");
    }
    return spec;
  }

  public record StartCommand(
      String requestId,
      String goal,
      String title,
      TaskSpecDescription spec,
      String coordinatorAgentId,
      String implementerAgentId,
      Instant occurredAt) {
    public StartCommand(
        String requestId,
        String goal,
        String title,
        String scope,
        List<String> acceptanceCriteria,
        List<String> verificationCommands,
        String coordinatorAgentId,
        String implementerAgentId,
        Instant occurredAt) {
      this(
          requestId,
          goal,
          title,
          new TaskSpecDescription(
              "1.0",
              List.of(
                  new TaskSpecDescription.Step(
                      "clarify", "Clarify scope", "Clarify scope: " + normalizeStatic(scope)),
                  new TaskSpecDescription.Step(
                      "implement",
                      "Implement changes",
                      "Implement changes for goal: " + normalizeStatic(goal)),
                  new TaskSpecDescription.Step(
                      "validate", "Validate and finalize", "Validate and finalize implementation")),
              List.of(
                  new TaskSpecDescription.Dependency("clarify", "implement"),
                  new TaskSpecDescription.Dependency("implement", "validate")),
              acceptanceCriteria == null ? List.of() : acceptanceCriteria,
              verificationCommands == null ? List.of() : verificationCommands),
          coordinatorAgentId,
          implementerAgentId,
          occurredAt);
    }
  }

  private static String normalizeStatic(String value) {
    return value == null || value.isBlank() ? "n/a" : value.trim();
  }

  private record StepPlan(String title, String objective) {}
}
