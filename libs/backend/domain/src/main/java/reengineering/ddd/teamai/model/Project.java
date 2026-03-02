package reengineering.ddd.teamai.model;

import java.time.Instant;
import java.util.Collection;
import java.util.Objects;
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
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;

public class Project implements Entity<String, ProjectDescription> {
  private String identity;
  private ProjectDescription description;
  private Members members;
  private Conversations conversations;
  private LogicalEntities logicalEntities;
  private Diagrams diagrams;
  private Agents agents;
  private Tasks tasks;
  private AgentEvents events;

  public Project(
      String identity,
      ProjectDescription description,
      Members members,
      Conversations conversations,
      LogicalEntities logicalEntities,
      Diagrams diagrams,
      Agents agents,
      Tasks tasks,
      AgentEvents events) {
    this.identity = identity;
    this.description = description;
    this.members = members;
    this.conversations = conversations;
    this.logicalEntities = logicalEntities;
    this.diagrams = diagrams;
    this.agents = agents;
    this.tasks = tasks;
    this.events = events;
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

  public HasMany<String, AgentEvent> events() {
    return events;
  }

  public AgentEvent appendEvent(AgentEventDescription description) {
    return events.append(description);
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
}
