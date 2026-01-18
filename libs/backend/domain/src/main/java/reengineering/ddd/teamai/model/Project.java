package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

public class Project implements Entity<String, ProjectDescription> {
  private String identity;
  private ProjectDescription description;
  private Conversations conversations;

  public Project(String identity, ProjectDescription description, Conversations conversations) {
    this.identity = identity;
    this.description = description;
    this.conversations = conversations;
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

  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);
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
