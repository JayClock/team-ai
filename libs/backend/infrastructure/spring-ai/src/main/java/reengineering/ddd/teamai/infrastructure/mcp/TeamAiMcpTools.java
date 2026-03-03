package reengineering.ddd.teamai.infrastructure.mcp;

import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.Task;

@Component
public class TeamAiMcpTools {
  private static final String DEFAULT_COORDINATOR_NAME = "Routa Coordinator";
  private static final String DEFAULT_IMPLEMENTER_NAME = "Crafter Implementer";
  private static final Set<OrchestrationSessionDescription.Status>
      CANCELLABLE_ORCHESTRATION_STATES =
          EnumSet.of(
              OrchestrationSessionDescription.Status.PENDING,
              OrchestrationSessionDescription.Status.RUNNING,
              OrchestrationSessionDescription.Status.REVIEW_REQUIRED);

  private final Projects projects;

  public TeamAiMcpTools(Projects projects) {
    this.projects = projects;
  }

  @Tool(name = "list_projects", description = "List all projects.")
  public List<ProjectSummary> listProjects() {
    return projects.findAll().stream().map(this::toProjectSummary).toList();
  }

  @Tool(name = "list_agents", description = "List all agents in a project.")
  public List<AgentSummary> listAgents(@ToolParam(description = "Project ID") String projectId) {
    Project project = requireProject(projectId);
    return project.agents().findAll().stream().map(this::toAgentSummary).toList();
  }

  @Tool(name = "create_agent", description = "Create an agent in a project.")
  public AgentSummary createAgent(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Agent name") String name,
      @ToolParam(description = "Agent role: ROUTA | CRAFTER | GATE | DEVELOPER") String role,
      @ToolParam(required = false, description = "Model tier, default SMART") String modelTier,
      @ToolParam(required = false, description = "Parent agent ID") String parentAgentId) {
    Project project = requireProject(projectId);
    AgentDescription.Role parsedRole =
        AgentDescription.Role.valueOf(role.trim().toUpperCase(Locale.ROOT));
    String resolvedModelTier = isBlank(modelTier) ? "SMART" : modelTier.trim();
    Ref<String> parent = isBlank(parentAgentId) ? null : new Ref<>(parentAgentId.trim());

    Agent created =
        project.createAgent(
            new AgentDescription(
                name, parsedRole, resolvedModelTier, AgentDescription.Status.PENDING, parent));
    return toAgentSummary(created);
  }

  @Tool(name = "list_tasks", description = "List all tasks in a project.")
  public List<TaskSummary> listTasks(@ToolParam(description = "Project ID") String projectId) {
    Project project = requireProject(projectId);
    return project.tasks().findAll().stream().map(this::toTaskSummary).toList();
  }

  @Tool(name = "create_task", description = "Create a new task in a project.")
  public TaskSummary createTask(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Task title") String title,
      @ToolParam(description = "Task objective") String objective,
      @ToolParam(required = false, description = "Task scope") String scope,
      @ToolParam(required = false, description = "Acceptance criteria list")
          List<String> acceptanceCriteria,
      @ToolParam(required = false, description = "Verification command list")
          List<String> verificationCommands) {
    Project project = requireProject(projectId);
    Task created =
        project.createTask(
            new TaskDescription(
                title,
                objective,
                blankToNull(scope),
                emptyToNull(acceptanceCriteria),
                emptyToNull(verificationCommands),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));
    return toTaskSummary(created);
  }

  @Tool(
      name = "delegate_task_to_agent",
      description = "Delegate a task to an assignee and activate execution.")
  public TaskSummary delegateTaskToAgent(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Task ID") String taskId,
      @ToolParam(description = "Assignee agent ID") String assigneeId,
      @ToolParam(description = "Caller agent ID") String callerAgentId) {
    Project project = requireProject(projectId);
    project.delegateTaskForExecution(
        taskId, new Ref<>(assigneeId), new Ref<>(callerAgentId), Instant.now());
    return reloadTask(project, taskId);
  }

  @Tool(name = "submit_task_for_review", description = "Move task to REVIEW_REQUIRED.")
  public TaskSummary submitTaskForReview(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Task ID") String taskId,
      @ToolParam(description = "Implementer agent ID") String implementerAgentId,
      @ToolParam(description = "Completion summary") String completionSummary) {
    Project project = requireProject(projectId);
    project.submitTaskForReview(
        taskId, new Ref<>(implementerAgentId), completionSummary, Instant.now());
    return reloadTask(project, taskId);
  }

  @Tool(name = "approve_task", description = "Approve a REVIEW_REQUIRED task.")
  public TaskSummary approveTask(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Task ID") String taskId,
      @ToolParam(description = "Reviewer agent ID") String reviewerAgentId,
      @ToolParam(description = "Verification report") String verificationReport) {
    Project project = requireProject(projectId);
    project.approveTask(taskId, new Ref<>(reviewerAgentId), verificationReport, Instant.now());
    return reloadTask(project, taskId);
  }

  @Tool(name = "request_task_fix", description = "Reject review and move task to NEEDS_FIX.")
  public TaskSummary requestTaskFix(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Task ID") String taskId,
      @ToolParam(description = "Reviewer agent ID") String reviewerAgentId,
      @ToolParam(description = "Verification report") String verificationReport) {
    Project project = requireProject(projectId);
    project.requestTaskFix(taskId, new Ref<>(reviewerAgentId), verificationReport, Instant.now());
    return reloadTask(project, taskId);
  }

  @Tool(name = "list_agent_events", description = "List latest agent events in a project.")
  public List<AgentEventSummary> listAgentEvents(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(required = false, description = "Max number of events, default 50")
          Integer limit) {
    Project project = requireProject(projectId);
    int resolvedLimit = limit == null || limit < 1 ? 50 : limit;
    return project.events().findAll().stream()
        .sorted(
            Comparator.comparing(
                    (AgentEvent event) -> event.getDescription().occurredAt(),
                    Comparator.nullsLast(Comparator.naturalOrder()))
                .reversed())
        .limit(resolvedLimit)
        .map(this::toAgentEventSummary)
        .toList();
  }

  @Tool(name = "start_orchestration", description = "Start a project orchestration session.")
  public OrchestrationSummary startOrchestration(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Orchestration goal") String goal,
      @ToolParam(required = false, description = "Task title") String title,
      @ToolParam(required = false, description = "Task scope") String scope,
      @ToolParam(required = false, description = "Acceptance criteria list")
          List<String> acceptanceCriteria,
      @ToolParam(required = false, description = "Verification command list")
          List<String> verificationCommands,
      @ToolParam(required = false, description = "Coordinator agent ID") String coordinatorAgentId,
      @ToolParam(required = false, description = "Implementer agent ID")
          String implementerAgentId) {
    Project project = requireProject(projectId);
    String normalizedGoal = requireText(goal, "goal");
    Instant occurredAt = Instant.now();

    Ref<String> coordinator = resolveCoordinator(project, coordinatorAgentId);
    Ref<String> implementer = resolveImplementer(project, implementerAgentId);

    Task task =
        project.createTask(
            new TaskDescription(
                resolveTaskTitle(title, normalizedGoal),
                normalizedGoal,
                blankToNull(scope),
                emptyToNull(acceptanceCriteria),
                emptyToNull(verificationCommands),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));
    Ref<String> taskRef = new Ref<>(task.getIdentity());
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.MESSAGE_SENT,
            coordinator,
            taskRef,
            normalizedGoal,
            occurredAt));
    project.delegateTaskForExecution(task.getIdentity(), implementer, coordinator, occurredAt);

    OrchestrationSession session =
        project.startOrchestrationSession(
            new OrchestrationSessionDescription(
                normalizedGoal,
                OrchestrationSessionDescription.Status.RUNNING,
                coordinator,
                implementer,
                taskRef,
                null,
                occurredAt,
                null,
                null));
    return toOrchestrationSummary(session);
  }

  @Tool(name = "get_orchestration", description = "Get a project orchestration session.")
  public OrchestrationSummary getOrchestration(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Orchestration session ID") String orchestrationId) {
    Project project = requireProject(projectId);
    return requireOrchestration(project, orchestrationId)
        .map(this::toOrchestrationSummary)
        .orElseThrow(
            () -> new IllegalArgumentException("Orchestration not found: " + orchestrationId));
  }

  @Tool(name = "list_orchestrations", description = "List orchestration sessions in a project.")
  public List<OrchestrationSummary> listOrchestrations(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(required = false, description = "Max number of sessions, default 50")
          Integer limit) {
    Project project = requireProject(projectId);
    int resolvedLimit = limit == null || limit < 1 ? 50 : limit;
    return project.orchestrationSessions().findAll().stream()
        .sorted(
            Comparator.comparing(
                    (OrchestrationSession session) -> session.getDescription().startedAt(),
                    Comparator.nullsLast(Comparator.naturalOrder()))
                .reversed())
        .limit(resolvedLimit)
        .map(this::toOrchestrationSummary)
        .toList();
  }

  @Tool(name = "cancel_orchestration", description = "Cancel an active orchestration session.")
  public OrchestrationSummary cancelOrchestration(
      @ToolParam(description = "Project ID") String projectId,
      @ToolParam(description = "Orchestration session ID") String orchestrationId,
      @ToolParam(description = "Cancellation reason") String reason) {
    Project project = requireProject(projectId);
    String normalizedReason = requireText(reason, "reason");
    OrchestrationSession session =
        requireOrchestration(project, orchestrationId)
            .orElseThrow(
                () -> new IllegalArgumentException("Orchestration not found: " + orchestrationId));

    if (!CANCELLABLE_ORCHESTRATION_STATES.contains(session.getDescription().status())) {
      throw new IllegalStateException(
          "Cannot cancel orchestration in state " + session.getDescription().status());
    }

    project.updateOrchestrationSessionStatus(
        orchestrationId,
        OrchestrationSessionDescription.Status.CANCELLED,
        session.getDescription().currentStep(),
        Instant.now(),
        normalizedReason);

    return getOrchestration(projectId, orchestrationId);
  }

  private Project requireProject(String projectId) {
    if (isBlank(projectId)) {
      throw new IllegalArgumentException("projectId must not be blank");
    }
    return projects
        .findByIdentity(projectId)
        .orElseThrow(() -> new IllegalArgumentException("Project not found: " + projectId));
  }

  private TaskSummary reloadTask(Project project, String taskId) {
    return project.tasks().findByIdentity(taskId).map(this::toTaskSummary).orElseThrow();
  }

  private Optional<OrchestrationSession> requireOrchestration(
      Project project, String orchestrationId) {
    if (isBlank(orchestrationId)) {
      throw new IllegalArgumentException("orchestrationId must not be blank");
    }
    return project.orchestrationSessions().findByIdentity(orchestrationId.trim());
  }

  private ProjectSummary toProjectSummary(Project project) {
    return new ProjectSummary(project.getIdentity(), project.getDescription().name());
  }

  private AgentSummary toAgentSummary(Agent agent) {
    return new AgentSummary(
        agent.getIdentity(),
        agent.getDescription().name(),
        agent.getDescription().role().name(),
        agent.getDescription().status().name(),
        agent.getDescription().modelTier(),
        agent.getDescription().parent() == null ? null : agent.getDescription().parent().id());
  }

  private TaskSummary toTaskSummary(Task task) {
    TaskDescription description = task.getDescription();
    return new TaskSummary(
        task.getIdentity(),
        description.title(),
        description.objective(),
        description.status().name(),
        description.assignedTo() == null ? null : description.assignedTo().id(),
        description.delegatedBy() == null ? null : description.delegatedBy().id(),
        description.completionSummary(),
        description.verificationVerdict() == null
            ? null
            : description.verificationVerdict().name());
  }

  private AgentEventSummary toAgentEventSummary(AgentEvent event) {
    return new AgentEventSummary(
        event.getIdentity(),
        event.getDescription().type().name(),
        event.getDescription().agent() == null ? null : event.getDescription().agent().id(),
        event.getDescription().task() == null ? null : event.getDescription().task().id(),
        event.getDescription().message(),
        event.getDescription().occurredAt());
  }

  private OrchestrationSummary toOrchestrationSummary(OrchestrationSession session) {
    OrchestrationSessionDescription description = session.getDescription();
    return new OrchestrationSummary(
        session.getIdentity(),
        description.goal(),
        toOrchestrationState(description.status()),
        description.coordinator() == null ? null : description.coordinator().id(),
        description.implementer() == null ? null : description.implementer().id(),
        description.task() == null ? null : description.task().id(),
        description.currentStep() == null ? null : description.currentStep().id(),
        description.startedAt(),
        description.completedAt(),
        description.failureReason());
  }

  private Ref<String> resolveCoordinator(Project project, String explicitAgentId) {
    if (!isBlank(explicitAgentId)) {
      Agent coordinator =
          project
              .agents()
              .findByIdentity(explicitAgentId.trim())
              .orElseThrow(
                  () -> new IllegalArgumentException("Coordinator not found: " + explicitAgentId));
      if (coordinator.getDescription().role() == AgentDescription.Role.GATE) {
        throw new IllegalStateException(
            "coordinator role must be one of [ROUTA, CRAFTER, DEVELOPER], but was GATE");
      }
      return new Ref<>(coordinator.getIdentity());
    }

    return project.agents().findAll().stream()
        .filter(agent -> agent.getDescription().role() == AgentDescription.Role.ROUTA)
        .findFirst()
        .map(Agent::getIdentity)
        .map(Ref::new)
        .orElseGet(
            () ->
                new Ref<>(
                    project
                        .createAgent(
                            new AgentDescription(
                                DEFAULT_COORDINATOR_NAME,
                                AgentDescription.Role.ROUTA,
                                "SMART",
                                AgentDescription.Status.PENDING,
                                null))
                        .getIdentity()));
  }

  private Ref<String> resolveImplementer(Project project, String explicitAgentId) {
    if (!isBlank(explicitAgentId)) {
      Agent implementer =
          project
              .agents()
              .findByIdentity(explicitAgentId.trim())
              .orElseThrow(
                  () -> new IllegalArgumentException("Implementer not found: " + explicitAgentId));
      if (!isImplementerRole(implementer.getDescription().role())) {
        throw new IllegalStateException(
            "implementer role must be one of [CRAFTER, DEVELOPER], but was "
                + implementer.getDescription().role());
      }
      return new Ref<>(implementer.getIdentity());
    }

    return project.agents().findAll().stream()
        .filter(agent -> isImplementerRole(agent.getDescription().role()))
        .findFirst()
        .map(Agent::getIdentity)
        .map(Ref::new)
        .orElseGet(
            () ->
                new Ref<>(
                    project
                        .createAgent(
                            new AgentDescription(
                                DEFAULT_IMPLEMENTER_NAME,
                                AgentDescription.Role.CRAFTER,
                                "SMART",
                                AgentDescription.Status.PENDING,
                                null))
                        .getIdentity()));
  }

  private boolean isImplementerRole(AgentDescription.Role role) {
    return role == AgentDescription.Role.CRAFTER || role == AgentDescription.Role.DEVELOPER;
  }

  private String resolveTaskTitle(String title, String goal) {
    String normalizedTitle = blankToNull(title);
    if (normalizedTitle != null) {
      return normalizedTitle;
    }
    return goal.length() <= 120 ? goal : goal.substring(0, 120);
  }

  private String blankToNull(String value) {
    return isBlank(value) ? null : value.trim();
  }

  private <T> List<T> emptyToNull(List<T> values) {
    if (values == null) {
      return null;
    }
    List<T> sanitized = values.stream().filter(Objects::nonNull).toList();
    return sanitized.isEmpty() ? null : sanitized;
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private String requireText(String value, String fieldName) {
    String normalized = blankToNull(value);
    if (normalized == null) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
    return normalized;
  }

  private String toOrchestrationState(OrchestrationSessionDescription.Status status) {
    if (status == OrchestrationSessionDescription.Status.RUNNING) {
      return "STARTED";
    }
    return status.name();
  }

  public record ProjectSummary(String id, String name) {}

  public record AgentSummary(
      String id, String name, String role, String status, String modelTier, String parentAgentId) {}

  public record TaskSummary(
      String id,
      String title,
      String objective,
      String status,
      String assignedTo,
      String delegatedBy,
      String completionSummary,
      String verificationVerdict) {}

  public record AgentEventSummary(
      String id, String type, String agentId, String taskId, String message, Instant occurredAt) {}

  public record OrchestrationSummary(
      String id,
      String goal,
      String state,
      String coordinatorAgentId,
      String implementerAgentId,
      String taskId,
      String currentStepId,
      Instant startedAt,
      Instant completedAt,
      String failureReason) {}
}
