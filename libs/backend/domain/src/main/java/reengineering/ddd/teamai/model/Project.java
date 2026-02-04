package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

public class Project implements Entity<String, ProjectDescription> {
  private String identity;
  private ProjectDescription description;
  private Members members;
  private Conversations conversations;
  private LogicalEntities logicalEntities;

  public Project(
      String identity,
      ProjectDescription description,
      Members members,
      Conversations conversations,
      LogicalEntities logicalEntities) {
    this.identity = identity;
    this.description = description;
    this.members = members;
    this.conversations = conversations;
    this.logicalEntities = logicalEntities;
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

  public Member invite(String userId, Role role) {
    return members.invite(userId, role.name());
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

  public interface Members extends HasMany<String, Member> {
    Member invite(String userId, String role);
  }

  public interface LogicalEntities extends HasMany<String, LogicalEntity> {
    LogicalEntity add(LogicalEntityDescription description);
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

  public static class ProjectChange {
    private String name;
    private String domainModel;

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public String getDomainModel() {
      return domainModel;
    }

    public void setDomainModel(String domainModel) {
      this.domainModel = domainModel;
    }
  }
}
