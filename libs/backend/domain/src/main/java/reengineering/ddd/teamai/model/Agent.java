package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.AgentDescription;

public class Agent implements Entity<String, AgentDescription> {
  private String identity;
  private AgentDescription description;

  public Agent(String identity, AgentDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public Agent() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public AgentDescription getDescription() {
    return description;
  }
}
