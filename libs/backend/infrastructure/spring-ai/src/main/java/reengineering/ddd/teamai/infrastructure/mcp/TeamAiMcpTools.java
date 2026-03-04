package reengineering.ddd.teamai.infrastructure.mcp;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.Task;

@Component
public class TeamAiMcpTools {
  private final Projects projects;

  public TeamAiMcpTools(Projects projects) {
    this.projects = projects;
  }

  @Tool(name = "list_projects", description = "List all projects.")
  public List<ProjectSummary> listProjects() {
    String userId = requireCurrentUserId();
    return projects.findAll().stream()
        .filter(project -> isProjectMember(project, userId))
        .map(this::toProjectSummary)
        .toList();
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
      @ToolParam(description = "Agent role: ROUTA | CRAFTER | GATE | DEVELOPER | SPECIALIST")
          String role,
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
                name,
                parsedRole,
                resolvedModelTier,
                AgentDescription.Status.PENDING,
                parent,
                null));
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

  private Project requireProject(String projectId) {
    if (isBlank(projectId)) {
      throw new IllegalArgumentException("projectId must not be blank");
    }
    Project project =
        projects
            .findByIdentity(projectId)
            .orElseThrow(() -> new IllegalArgumentException("Project not found: " + projectId));
    requireProjectMembership(project);
    return project;
  }

  private void requireProjectMembership(Project project) {
    String userId = requireCurrentUserId();
    if (!isProjectMember(project, userId)) {
      throw new SecurityException(
          "User %s is not a member of project %s".formatted(userId, project.getIdentity()));
    }
  }

  private String requireCurrentUserId() {
    if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
      throw new IllegalStateException("Authentication required");
    }
    var principal = attrs.getRequest().getUserPrincipal();
    if (principal == null) {
      throw new IllegalStateException("Authentication required");
    }
    String userId = principal.getName();
    if (isBlank(userId)) {
      throw new IllegalStateException("Authentication required");
    }
    return userId;
  }

  private boolean isProjectMember(Project project, String userId) {
    return project.members().findByIdentity(userId).isPresent();
  }

  private TaskSummary reloadTask(Project project, String taskId) {
    return project.tasks().findByIdentity(taskId).map(this::toTaskSummary).orElseThrow();
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
        description.verificationVerdict() == null ? null : description.verificationVerdict().name());
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
}
