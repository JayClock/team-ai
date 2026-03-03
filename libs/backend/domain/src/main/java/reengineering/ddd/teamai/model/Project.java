package reengineering.ddd.teamai.model;

import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.OrchestrationStepDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;

public class Project implements Entity<String, ProjectDescription> {
  private static final Set<AgentDescription.Role> IMPLEMENTER_ROLES =
      EnumSet.of(
          AgentDescription.Role.CRAFTER,
          AgentDescription.Role.DEVELOPER,
          AgentDescription.Role.SPECIALIST);
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
  private AcpSessions acpSessions;
  private McpServers mcpServers;

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
    this(
        identity,
        description,
        members,
        conversations,
        logicalEntities,
        diagrams,
        agents,
        tasks,
        events,
        orchestrationSessions,
        null,
        null);
  }

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
      OrchestrationSessions orchestrationSessions,
      McpServers mcpServers) {
    this(
        identity,
        description,
        members,
        conversations,
        logicalEntities,
        diagrams,
        agents,
        tasks,
        events,
        orchestrationSessions,
        null,
        mcpServers);
  }

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
      OrchestrationSessions orchestrationSessions,
      AcpSessions acpSessions,
      McpServers mcpServers) {
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
    this.acpSessions = acpSessions;
    this.mcpServers = mcpServers;
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

  public void updateAgent(String agentId, AgentDescription description) {
    if (agentId == null || agentId.isBlank()) {
      throw new IllegalArgumentException("agentId must not be blank");
    }
    if (description == null) {
      throw new IllegalArgumentException("description must not be null");
    }
    if (agents.findByIdentity(agentId).isEmpty()) {
      throw new IllegalArgumentException("Agent not found: " + agentId);
    }
    agents.update(agentId, description);
  }

  public void deleteAgent(String agentId) {
    if (agentId == null || agentId.isBlank()) {
      throw new IllegalArgumentException("agentId must not be blank");
    }
    if (agents.findByIdentity(agentId).isEmpty()) {
      throw new IllegalArgumentException("Agent not found: " + agentId);
    }
    agents.delete(agentId);
  }

  public McpServers mcpServers() {
    return mcpServers == null ? EMPTY_MCP_SERVERS : mcpServers;
  }

  public AcpSessions acpSessions() {
    return acpSessions == null ? EMPTY_ACP_SESSIONS : acpSessions;
  }

  public AcpSession startAcpSession(AcpSessionDescription description) {
    if (description == null) {
      throw new IllegalArgumentException("description must not be null");
    }
    return acpSessions().create(description);
  }

  public Many<AcpSession> findAcpSessions(String projectId, int offset, int limit) {
    if (projectId == null || projectId.isBlank()) {
      throw new IllegalArgumentException("projectId must not be blank");
    }
    if (offset < 0) {
      throw new IllegalArgumentException("offset must not be negative");
    }
    if (limit < 1) {
      throw new IllegalArgumentException("limit must be greater than 0");
    }
    return acpSessions().findByProject(projectId, offset, limit);
  }

  public void touchAcpSession(String sessionId, Instant lastActivityAt, String lastEventId) {
    AcpSession session = acpSessionOrThrow(sessionId);
    if (session.getDescription().status().isTerminal()) {
      throw new IllegalStateException(
          "Cannot touch ACP session in terminal state " + session.getDescription().status());
    }
    acpSessions().touch(sessionId, normalizeEventTime(lastActivityAt));
    String normalizedLastEventId = normalizeText(lastEventId);
    if (normalizedLastEventId != null) {
      acpSessions().bindLastEventId(sessionId, normalizedLastEventId);
    }
  }

  public void updateAcpSessionStatus(
      String sessionId,
      AcpSessionDescription.Status status,
      Instant completedAt,
      String failureReason) {
    if (status == null) {
      throw new IllegalArgumentException("status must not be null");
    }
    AcpSession session = acpSessionOrThrow(sessionId);
    requireAcpStatusTransition(session.getDescription().status(), status);
    requireFailureReasonForAcpStatus(status, failureReason);
    Instant resolvedCompletedAt = status.isTerminal() ? normalizeEventTime(completedAt) : null;
    acpSessions()
        .updateStatus(sessionId, status, resolvedCompletedAt, normalizeText(failureReason));
  }

  public McpServer createMcpServer(McpServerDescription description) {
    if (description == null) {
      throw new IllegalArgumentException("description must not be null");
    }
    return mcpServers().create(description);
  }

  public void updateMcpServer(String serverId, McpServerDescription description) {
    if (serverId == null || serverId.isBlank()) {
      throw new IllegalArgumentException("serverId must not be blank");
    }
    if (description == null) {
      throw new IllegalArgumentException("description must not be null");
    }
    if (mcpServers().findByIdentity(serverId).isEmpty()) {
      throw new IllegalArgumentException("MCP server not found: " + serverId);
    }
    mcpServers().update(serverId, description);
  }

  public void deleteMcpServer(String serverId) {
    if (serverId == null || serverId.isBlank()) {
      throw new IllegalArgumentException("serverId must not be blank");
    }
    if (mcpServers().findByIdentity(serverId).isEmpty()) {
      throw new IllegalArgumentException("MCP server not found: " + serverId);
    }
    mcpServers().delete(serverId);
  }

  public Tasks tasks() {
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

  public OrchestrationSessions orchestrationSessions() {
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
    requireText(sessionId, "sessionId");
    if (status == null) {
      throw new IllegalArgumentException("status must not be null");
    }

    OrchestrationSessions sessions = requireOrchestrationSessions();
    OrchestrationSession session =
        sessions
            .findByIdentity(sessionId)
            .orElseThrow(
                () ->
                    new IllegalArgumentException("Orchestration session not found: " + sessionId));
    requireOrchestrationStatusTransition(session.getDescription().status(), status);
    requireFailureReasonForOrchestrationStatus(status, failureReason);
    Instant resolvedCompletedAt = resolveOrchestrationCompletedAt(status, completedAt);
    sessions.updateStatus(sessionId, status, currentStep, resolvedCompletedAt, failureReason);
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

    void update(String agentId, AgentDescription description);

    void delete(String agentId);

    void updateStatus(Ref<String> agent, AgentDescription.Status status);
  }

  public interface Tasks extends HasMany<String, Task> {
    Task create(TaskDescription description);

    void assign(String taskId, Ref<String> agent, Ref<String> callerAgent);

    Optional<Task> findByDelegateRequestId(String requestId);

    Optional<Task> findByApproveRequestId(String requestId);

    void bindDelegateRequestId(String taskId, String requestId);

    void bindApproveRequestId(String taskId, String requestId);

    void updateStatus(String taskId, TaskDescription.Status status, String completionSummary);

    void report(String taskId, Ref<String> agent, TaskReportDescription report);
  }

  public interface AgentEvents extends HasMany<String, AgentEvent> {
    AgentEvent append(AgentEventDescription description);
  }

  public interface OrchestrationSessions extends HasMany<String, OrchestrationSession> {
    OrchestrationSession create(OrchestrationSessionDescription description);

    OrchestrationStep createStep(
        String sessionId, int sequenceNo, OrchestrationStepDescription description);

    List<OrchestrationStep> findSteps(String sessionId);

    Optional<OrchestrationStep> findNextPendingStep(String sessionId);

    Optional<OrchestrationSession> findByStartRequestId(String requestId);

    void bindStartRequestId(String sessionId, String requestId);

    void updateStatus(
        String sessionId,
        OrchestrationSessionDescription.Status status,
        Ref<String> currentStep,
        Instant completedAt,
        String failureReason);

    void updateStepStatus(
        String sessionId,
        String stepId,
        OrchestrationStepDescription.Status status,
        Instant startedAt,
        Instant completedAt,
        String failureReason);
  }

  public interface AcpSessions extends HasMany<String, AcpSession> {
    AcpSession create(AcpSessionDescription description);

    Many<AcpSession> findByProject(String projectId, int offset, int limit);

    void updateStatus(
        String sessionId,
        AcpSessionDescription.Status status,
        Instant completedAt,
        String failureReason);

    void touch(String sessionId, Instant lastActivityAt);

    void bindLastEventId(String sessionId, String lastEventId);
  }

  public interface McpServers extends HasMany<String, McpServer> {
    McpServer create(McpServerDescription description);

    void update(String serverId, McpServerDescription description);

    void delete(String serverId);
  }

  private static final McpServers EMPTY_MCP_SERVERS =
      new McpServers() {
        private final Many<McpServer> empty =
            new Many<>() {
              @Override
              public int size() {
                return 0;
              }

              @Override
              public Many<McpServer> subCollection(int from, int to) {
                return this;
              }

              @Override
              public Iterator<McpServer> iterator() {
                return Collections.emptyIterator();
              }
            };

        @Override
        public Many<McpServer> findAll() {
          return empty;
        }

        @Override
        public Optional<McpServer> findByIdentity(String identifier) {
          return Optional.empty();
        }

        @Override
        public McpServer create(McpServerDescription description) {
          throw new IllegalStateException("mcpServers association is not configured");
        }

        @Override
        public void update(String serverId, McpServerDescription description) {
          throw new IllegalStateException("mcpServers association is not configured");
        }

        @Override
        public void delete(String serverId) {
          throw new IllegalStateException("mcpServers association is not configured");
        }
      };

  private static final AcpSessions EMPTY_ACP_SESSIONS =
      new AcpSessions() {
        private final Many<AcpSession> empty =
            new Many<>() {
              @Override
              public int size() {
                return 0;
              }

              @Override
              public Many<AcpSession> subCollection(int from, int to) {
                return this;
              }

              @Override
              public Iterator<AcpSession> iterator() {
                return Collections.emptyIterator();
              }
            };

        @Override
        public Many<AcpSession> findAll() {
          return empty;
        }

        @Override
        public Optional<AcpSession> findByIdentity(String identifier) {
          return Optional.empty();
        }

        @Override
        public AcpSession create(AcpSessionDescription description) {
          throw new IllegalStateException("acpSessions association is not configured");
        }

        @Override
        public Many<AcpSession> findByProject(String projectId, int offset, int limit) {
          return empty;
        }

        @Override
        public void updateStatus(
            String sessionId,
            AcpSessionDescription.Status status,
            Instant completedAt,
            String failureReason) {
          throw new IllegalStateException("acpSessions association is not configured");
        }

        @Override
        public void touch(String sessionId, Instant lastActivityAt) {
          throw new IllegalStateException("acpSessions association is not configured");
        }

        @Override
        public void bindLastEventId(String sessionId, String lastEventId) {
          throw new IllegalStateException("acpSessions association is not configured");
        }
      };

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

  private String normalizeText(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private void requireOrchestrationStatusTransition(
      OrchestrationSessionDescription.Status current, OrchestrationSessionDescription.Status next) {
    if (current == next) {
      return;
    }

    boolean allowed =
        switch (current) {
          case PENDING ->
              next == OrchestrationSessionDescription.Status.RUNNING
                  || next == OrchestrationSessionDescription.Status.CANCELLED;
          case RUNNING ->
              next == OrchestrationSessionDescription.Status.REVIEW_REQUIRED
                  || next == OrchestrationSessionDescription.Status.COMPLETED
                  || next == OrchestrationSessionDescription.Status.FAILED
                  || next == OrchestrationSessionDescription.Status.CANCELLED;
          case REVIEW_REQUIRED ->
              next == OrchestrationSessionDescription.Status.RUNNING
                  || next == OrchestrationSessionDescription.Status.COMPLETED
                  || next == OrchestrationSessionDescription.Status.FAILED
                  || next == OrchestrationSessionDescription.Status.CANCELLED;
          case FAILED ->
              next == OrchestrationSessionDescription.Status.RUNNING
                  || next == OrchestrationSessionDescription.Status.CANCELLED;
          case COMPLETED, CANCELLED -> false;
        };

    if (!allowed) {
      throw new IllegalStateException(
          "Cannot transition orchestration session from " + current + " to " + next);
    }
  }

  private void requireFailureReasonForOrchestrationStatus(
      OrchestrationSessionDescription.Status status, String failureReason) {
    boolean requiresReason =
        status == OrchestrationSessionDescription.Status.FAILED
            || status == OrchestrationSessionDescription.Status.CANCELLED;
    if (requiresReason) {
      requireText(failureReason, "failureReason");
      return;
    }
    if (failureReason != null && !failureReason.isBlank()) {
      throw new IllegalArgumentException(
          "failureReason is only allowed for FAILED or CANCELLED status");
    }
  }

  private Instant resolveOrchestrationCompletedAt(
      OrchestrationSessionDescription.Status status, Instant completedAt) {
    boolean terminal =
        status == OrchestrationSessionDescription.Status.COMPLETED
            || status == OrchestrationSessionDescription.Status.FAILED
            || status == OrchestrationSessionDescription.Status.CANCELLED;
    if (!terminal) {
      if (completedAt != null) {
        throw new IllegalArgumentException(
            "completedAt is only allowed for COMPLETED, FAILED or CANCELLED status");
      }
      return null;
    }
    return completedAt == null ? Instant.now() : completedAt;
  }

  private AcpSession acpSessionOrThrow(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId must not be blank");
    }
    return acpSessions()
        .findByIdentity(sessionId)
        .orElseThrow(() -> new IllegalArgumentException("ACP session not found: " + sessionId));
  }

  private void requireAcpStatusTransition(
      AcpSessionDescription.Status current, AcpSessionDescription.Status next) {
    if (current == next) {
      return;
    }
    boolean allowed =
        switch (current) {
          case PENDING ->
              next == AcpSessionDescription.Status.RUNNING
                  || next == AcpSessionDescription.Status.CANCELLED
                  || next == AcpSessionDescription.Status.FAILED;
          case RUNNING ->
              next == AcpSessionDescription.Status.COMPLETED
                  || next == AcpSessionDescription.Status.CANCELLED
                  || next == AcpSessionDescription.Status.FAILED;
          case COMPLETED, CANCELLED, FAILED -> false;
        };
    if (!allowed) {
      throw new IllegalStateException(
          "Cannot transition ACP session from " + current + " to " + next);
    }
  }

  private void requireFailureReasonForAcpStatus(
      AcpSessionDescription.Status status, String failureReason) {
    boolean requiresReason =
        status == AcpSessionDescription.Status.FAILED
            || status == AcpSessionDescription.Status.CANCELLED;
    if (requiresReason) {
      requireText(failureReason, "failureReason");
      return;
    }
    if (failureReason != null && !failureReason.isBlank()) {
      throw new IllegalArgumentException(
          "failureReason is only allowed for FAILED or CANCELLED status");
    }
  }

  private OrchestrationSessions requireOrchestrationSessions() {
    if (orchestrationSessions == null) {
      throw new IllegalStateException("orchestrationSessions association is not configured");
    }
    return orchestrationSessions;
  }
}
