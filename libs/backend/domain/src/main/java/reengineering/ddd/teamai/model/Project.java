package reengineering.ddd.teamai.model;

import java.util.Collection;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

public class Project implements Entity<String, ProjectDescription> {
  private String identity;
  private ProjectDescription description;
  private Members members;
  private Conversations conversations;
  private LogicalEntities logicalEntities;
  private Diagrams diagrams;

  public Project(
      String identity,
      ProjectDescription description,
      Members members,
      Conversations conversations,
      LogicalEntities logicalEntities,
      Diagrams diagrams) {
    this.identity = identity;
    this.description = description;
    this.members = members;
    this.conversations = conversations;
    this.logicalEntities = logicalEntities;
    this.diagrams = diagrams;
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

  public void publishDiagram(String diagramId) {
    diagrams.publishDiagram(diagramId);
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

  public enum Role {
    OWNER,
    EDITOR,
    VIEWER
  }

  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);

    void delete(String id);
  }
}
