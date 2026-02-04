package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.LogicalEntityDescription;

public class LogicalEntity implements Entity<String, LogicalEntityDescription> {
  private String identity;
  private LogicalEntityDescription description;

  public LogicalEntity(String identity, LogicalEntityDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private LogicalEntity() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public LogicalEntityDescription getDescription() {
    return description;
  }
}
