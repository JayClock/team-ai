package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

public class Project implements Entity<String, ProjectDescription> {
  private String identity;
  private ProjectDescription description;
  private Conversations conversations;
  private BizDiagrams bizDiagrams;

  public Project(
      String identity,
      ProjectDescription description,
      Conversations conversations,
      BizDiagrams bizDiagrams) {
    this.identity = identity;
    this.description = description;
    this.conversations = conversations;
    this.bizDiagrams = bizDiagrams;
  }

  public Project(String identity, ProjectDescription description, Conversations conversations) {
    this(identity, description, conversations, null);
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

  public HasMany<String, Conversation> conversations() {
    return conversations;
  }

  public Conversation add(ConversationDescription description) {
    return conversations.add(description);
  }

  public BizDiagram addBizDiagram(BizDiagramDescription description) {
    return bizDiagrams.add(description);
  }

  public void deleteConversation(String conversationId) {
    conversations.delete(conversationId);
  }

  public void deleteBizDiagram(String bizDiagramId) {
    bizDiagrams.delete(bizDiagramId);
  }

  public HasMany<String, BizDiagram> bizDiagrams() {
    return bizDiagrams;
  }

  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);

    void delete(String id);
  }

  public interface BizDiagrams extends HasMany<String, BizDiagram> {
    BizDiagram add(BizDiagramDescription description);

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
