package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.AgentEventDescription;

public class AgentEvent implements Entity<String, AgentEventDescription> {
  private String identity;
  private AgentEventDescription description;

  public AgentEvent(String identity, AgentEventDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public AgentEvent() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public AgentEventDescription getDescription() {
    return description;
  }
}
