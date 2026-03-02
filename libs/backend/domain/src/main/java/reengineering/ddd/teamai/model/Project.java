package reengineering.ddd.teamai.model;

import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;

public class Project implements Entity<String, ProjectDescription> {
  private static final Set<AgentDescription.Role> IMPLEMENTER_ROLES =
      EnumSet.of(AgentDescription.Role.CRAFTER, AgentDescription.Role.DEVELOPER);
  private static final Set<AgentDescription.Role> REVIEWER_ROLES =
      EnumSet.of(AgentDescription.Role.GATE, AgentDescription.Role.DEVELOPER);
  private static final Set<AgentDescription.Role> DELEGATOR_ROLES =
      EnumSet.of(
          AgentDescription.Role.ROUTA,
          AgentDescription.Role.CRAFTER,
          AgentDescription.Role.DEVELOPER);

  private String identity;
  private ProjectDescription description;
  private Members members;
  private Conversations conversations;
  private LogicalEntities logicalEntities;
  private Diagrams diagrams;
  private Agents agents;
  private Tasks tasks;
  private AgentEvents events;
  private OrchestrationSessions orchestrationSessions;

  public Project(
      String identity,
      ProjectDescription description,
      Members members,
      Conversations conversations,
      LogicalEntities logicalEntities,
      Diagrams diagrams,
      Agents agents,
      Tasks tasks,
      AgentEvents events,
      OrchestrationSessions orchestrationSessions) {
    this.identity = identity;
    this.description = description;
    this.members = members;
    this.conversations = conversations;
    this.logicalEntities = logicalEntities;
    this.diagrams = diagrams;
    this.agents = agents;
    this.tasks = tasks;
    this.events = events;
    this.orchestrationSessions = orchestrationSessions;
  }

  private Project() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ProjectDescription getDescription() {
    return description;
  }

  public HasMany<String, Member> members() {
    return members;
  }

  public Member addMember(MemberDescription description) {
    return members.addMember(description);
  }

  public HasMany<String, Conversation> conversations() {
    return conversations;
  }

  public Conversation add(ConversationDescription description) {
    return conversations.add(description);
  }

  public void deleteConversation(String conversationId) {
    conversations.delete(conversationId);
  }

  public HasMany<String, LogicalEntity> logicalEntities() {
    return logicalEntities;
  }

  public LogicalEntity addLogicalEntity(LogicalEntityDescription description) {
    return logicalEntities.add(description);
  }

  public HasMany<String, Diagram> diagrams() {
    return diagrams;
  }

  public Diagram addDiagram(DiagramDescription description) {
    return diagrams.add(description);
  }

  public void saveDiagram(
      String diagramId,
      Collection<Diagrams.DraftNode> draftNodes,
      Collection<Diagrams.DraftEdge> draftEdges) {
    diagrams.saveDiagram(diagramId, draftNodes, draftEdges);
  }

  public void publishDiagram(String diagramId, KnowledgeGraphPublisher graphPublisher) {
    diagrams.publishDiagram(diagramId);
    Objects.requireNonNull(graphPublisher, "graphPublisher must not be null")
        .publish(new KnowledgeGraphPublishRequest(identity, diagramId, Instant.now()));
  }

  public HasMany<String, Agent> agents() {
    return agents;
  }

  public Agent createAgent(AgentDescription description) {
    return agents.create(description);
  }

  public void updateAgentStatus(Ref<String> agent, AgentDescription.Status status) {
    agents.updateStatus(agent, status);
  }

  public HasMany<String, Task> tasks() {
    return tasks;
  }

  public Task createTask(TaskDescription description) {
    return tasks.create(description);
  }

  public void delegateTask(String taskId, Ref<String> agent, Ref<String> callerAgent) {
    tasks.assign(taskId, agent, callerAgent);
  }

  public void updateTaskStatus(
      String taskId, TaskDescription.Status status, String completionSummary) {
    tasks.updateStatus(taskId, status, completionSummary);
  }

  public void reportTask(String taskId, Ref<String> agent, TaskReportDescription report) {
    tasks.report(taskId, agent, report);
  }

  public void delegateTaskForExecution(
      String taskId, Ref<String> assignee, Ref<String> callerAgent, Instant occurredAt) {
    Task task = taskOrThrow(taskId);
    Agent assigneeAgent = agentOrThrow(assignee, "assignee");
    Agent caller = agentOrThrow(callerAgent, "callerAgent");

    requireRole(assigneeAgent, IMPLEMENTER_ROLES, "assignee");
    requireRole(caller, DELEGATOR_ROLES, "callerAgent");
    requireStatus(
        task,
        "delegate task",
        TaskDescription.Status.PENDING,
        TaskDescription.Status.NEEDS_FIX,
        TaskDescription.Status.BLOCKED);

    delegateTask(taskId, assignee, callerAgent);
    updateTaskStatus(
        taskId, TaskDescription.Status.IN_PROGRESS, task.getDescription().completionSummary());
    updateAgentStatus(assignee, AgentDescription.Status.ACTIVE);

    Ref<String> taskRef = new Ref<>(taskId);
    Instant eventTime = normalizeEventTime(occurredAt);
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_ASSIGNED,
            assignee,
            taskRef,
            "Task delegated by agent " + callerAgent.id(),
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            assignee,
            taskRef,
            "Task moved to IN_PROGRESS",
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_ACTIVATED,
            assignee,
            taskRef,
            "Assignee activated for task execution",
            eventTime));
  }

  public void submitTaskForReview(
      String taskId, Ref<String> implementerAgent, String completionSummary, Instant occurredAt) {
    Task task = taskOrThrow(taskId);
    Agent implementer = agentOrThrow(implementerAgent, "implementerAgent");

    requireText(completionSummary, "completionSummary");
    requireRole(implementer, IMPLEMENTER_ROLES, "implementerAgent");
    requireStatus(task, "submit task for review", TaskDescription.Status.IN_PROGRESS);
    requireAssignedTo(task, implementerAgent);

    updateTaskStatus(taskId, TaskDescription.Status.REVIEW_REQUIRED, completionSummary);
    updateAgentStatus(implementerAgent, AgentDescription.Status.COMPLETED);

    Ref<String> taskRef = new Ref<>(taskId);
    Instant eventTime = normalizeEventTime(occurredAt);
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.REPORT_SUBMITTED,
            implementerAgent,
            taskRef,
            completionSummary,
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            implementerAgent,
            taskRef,
            "Task moved to REVIEW_REQUIRED",
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_COMPLETED,
            implementerAgent,
            taskRef,
            "Implementer finished and submitted for review",
            eventTime));
  }

  public void approveTask(
      String taskId, Ref<String> reviewerAgent, String verificationReport, Instant occurredAt) {
    Task task = taskOrThrow(taskId);
    Agent reviewer = agentOrThrow(reviewerAgent, "reviewerAgent");

    requireText(verificationReport, "verificationReport");
    requireRole(reviewer, REVIEWER_ROLES, "reviewerAgent");
    requireStatus(task, "approve task", TaskDescription.Status.REVIEW_REQUIRED);

    reportTask(
        taskId,
        reviewerAgent,
        new TaskReportDescription("Verification approved", true, verificationReport));

    String completionSummary = task.getDescription().completionSummary();
    if (completionSummary == null || completionSummary.isBlank()) {
      completionSummary = "Task completed after verification";
    }
    updateTaskStatus(taskId, TaskDescription.Status.COMPLETED, completionSummary);
    updateAgentStatus(reviewerAgent, AgentDescription.Status.COMPLETED);

    Ref<String> taskRef = new Ref<>(taskId);
    Instant eventTime = normalizeEventTime(occurredAt);
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.REPORT_SUBMITTED,
            reviewerAgent,
            taskRef,
            verificationReport,
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_COMPLETED,
            reviewerAgent,
            taskRef,
            completionSummary,
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            reviewerAgent,
            taskRef,
            "Task moved to COMPLETED",
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_COMPLETED,
            reviewerAgent,
            taskRef,
            "Reviewer approved completion",
            eventTime));

    Ref<String> assignedTo = task.getDescription().assignedTo();
    if (assignedTo != null && !assignedTo.equals(reviewerAgent)) {
      updateAgentStatus(assignedTo, AgentDescription.Status.COMPLETED);
      appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.AGENT_COMPLETED,
              assignedTo,
              taskRef,
              "Implementer marked completed after approval",
              eventTime));
    }
  }

  public void requestTaskFix(
      String taskId, Ref<String> reviewerAgent, String verificationReport, Instant occurredAt) {
    Task task = taskOrThrow(taskId);
    Agent reviewer = agentOrThrow(reviewerAgent, "reviewerAgent");

    requireText(verificationReport, "verificationReport");
    requireRole(reviewer, REVIEWER_ROLES, "reviewerAgent");
    requireStatus(task, "request task fix", TaskDescription.Status.REVIEW_REQUIRED);

    reportTask(
        taskId,
        reviewerAgent,
        new TaskReportDescription("Verification rejected", false, verificationReport));
    updateTaskStatus(
        taskId, TaskDescription.Status.NEEDS_FIX, task.getDescription().completionSummary());
    updateAgentStatus(reviewerAgent, AgentDescription.Status.COMPLETED);

    Ref<String> taskRef = new Ref<>(taskId);
    Instant eventTime = normalizeEventTime(occurredAt);
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.REPORT_SUBMITTED,
            reviewerAgent,
            taskRef,
            verificationReport,
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_FAILED,
            reviewerAgent,
            taskRef,
            "Verification rejected",
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.TASK_STATUS_CHANGED,
            reviewerAgent,
            taskRef,
            "Task moved to NEEDS_FIX",
            eventTime));
    appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_COMPLETED,
            reviewerAgent,
            taskRef,
            "Reviewer completed with fix request",
            eventTime));

    Ref<String> assignedTo = task.getDescription().assignedTo();
    if (assignedTo != null && !assignedTo.equals(reviewerAgent)) {
      updateAgentStatus(assignedTo, AgentDescription.Status.ACTIVE);
      appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.AGENT_ACTIVATED,
              assignedTo,
              taskRef,
              "Implementer reactivated for fixes",
              eventTime));
    }
  }

  public HasMany<String, AgentEvent> events() {
    return events;
  }

  public AgentEvent appendEvent(AgentEventDescription description) {
    return events.append(description);
  }

  public HasMany<String, OrchestrationSession> orchestrationSessions() {
    return requireOrchestrationSessions();
  }

  public OrchestrationSession startOrchestrationSession(
      OrchestrationSessionDescription description) {
    return requireOrchestrationSessions().create(description);
  }

  public void updateOrchestrationSessionStatus(
      String sessionId,
      OrchestrationSessionDescription.Status status,
      Ref<String> currentStep,
      Instant completedAt,
      String failureReason) {
    requireOrchestrationSessions()
        .updateStatus(sessionId, status, currentStep, completedAt, failureReason);
  }

  public interface Members extends HasMany<String, Member> {
    Member addMember(MemberDescription description);
  }

  public interface LogicalEntities extends HasMany<String, LogicalEntity> {
    LogicalEntity add(LogicalEntityDescription description);
  }

  public interface Diagrams extends HasMany<String, Diagram> {
    Diagram add(DiagramDescription description);

    void saveDiagram(
        String diagramId, Collection<DraftNode> draftNodes, Collection<DraftEdge> draftEdges);

    void publishDiagram(String diagramId);

    record DraftNode(String id, NodeDescription description) {}

    record DraftEdge(String sourceNodeId, String targetNodeId, boolean hidden) {}

    class InvalidDraftException extends RuntimeException {
      public InvalidDraftException(String message) {
        super(message);
      }
    }
  }

  public interface KnowledgeGraphPublisher {
    void publish(KnowledgeGraphPublishRequest request);
  }

  public record KnowledgeGraphPublishRequest(
      String projectId, String diagramId, Instant publishedAt) {}

  public enum Role {
    OWNER,
    EDITOR,
    VIEWER
  }

  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);

    void delete(String id);
  }

  public interface Agents extends HasMany<String, Agent> {
    Agent create(AgentDescription description);

    void updateStatus(Ref<String> agent, AgentDescription.Status status);
  }

  public interface Tasks extends HasMany<String, Task> {
    Task create(TaskDescription description);

    void assign(String taskId, Ref<String> agent, Ref<String> callerAgent);

    void updateStatus(String taskId, TaskDescription.Status status, String completionSummary);

    void report(String taskId, Ref<String> agent, TaskReportDescription report);
  }

  public interface AgentEvents extends HasMany<String, AgentEvent> {
    AgentEvent append(AgentEventDescription description);
  }

  public interface OrchestrationSessions extends HasMany<String, OrchestrationSession> {
    OrchestrationSession create(OrchestrationSessionDescription description);

    void updateStatus(
        String sessionId,
        OrchestrationSessionDescription.Status status,
        Ref<String> currentStep,
        Instant completedAt,
        String failureReason);
  }

  private Task taskOrThrow(String taskId) {
    if (taskId == null || taskId.isBlank()) {
      throw new IllegalArgumentException("taskId must not be blank");
    }
    return tasks
        .findByIdentity(taskId)
        .orElseThrow(() -> new IllegalArgumentException("Task not found: " + taskId));
  }

  private Agent agentOrThrow(Ref<String> agentRef, String fieldName) {
    if (agentRef == null || agentRef.id() == null || agentRef.id().isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
    return agents
        .findByIdentity(agentRef.id())
        .orElseThrow(() -> new IllegalArgumentException("Agent not found: " + agentRef.id()));
  }

  private void requireRole(Agent agent, Set<AgentDescription.Role> roles, String fieldName) {
    if (!roles.contains(agent.getDescription().role())) {
      throw new IllegalStateException(
          fieldName
              + " role must be one of "
              + roles
              + ", but was "
              + agent.getDescription().role());
    }
  }

  private void requireAssignedTo(Task task, Ref<String> implementerAgent) {
    if (!Objects.equals(task.getDescription().assignedTo(), implementerAgent)) {
      throw new IllegalStateException(
          "Task assignedTo mismatch. expected="
              + (task.getDescription().assignedTo() == null
                  ? "<none>"
                  : task.getDescription().assignedTo().id())
              + ", actual="
              + implementerAgent.id());
    }
  }

  private void requireStatus(
      Task task,
      String operation,
      TaskDescription.Status expected,
      TaskDescription.Status... additionallyAllowed) {
    TaskDescription.Status current = task.getDescription().status();
    if (current == expected) {
      return;
    }
    for (TaskDescription.Status status : additionallyAllowed) {
      if (current == status) {
        return;
      }
    }
    throw new IllegalStateException(
        "Cannot "
            + operation
            + " in status "
            + current
            + ". Allowed: "
            + expected
            + formatStatusList(additionallyAllowed));
  }

  private String formatStatusList(TaskDescription.Status[] statuses) {
    if (statuses.length == 0) {
      return "";
    }
    StringBuilder builder = new StringBuilder();
    for (TaskDescription.Status status : statuses) {
      builder.append(", ").append(status);
    }
    return builder.toString();
  }

  private void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }

  private Instant normalizeEventTime(Instant occurredAt) {
    return occurredAt == null ? Instant.now() : occurredAt;
  }

  private OrchestrationSessions requireOrchestrationSessions() {
    if (orchestrationSessions == null) {
      throw new IllegalStateException("orchestrationSessions association is not configured");
    }
    return orchestrationSessions;
  }
}
