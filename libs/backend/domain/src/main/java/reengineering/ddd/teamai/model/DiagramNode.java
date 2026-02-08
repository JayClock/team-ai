package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.NodeDescription;

public class DiagramNode implements Entity<String, NodeDescription> {
  private String identity;
  private NodeDescription description;

  public DiagramNode(String identity, NodeDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private DiagramNode() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public NodeDescription getDescription() {
    return description;
  }
}
