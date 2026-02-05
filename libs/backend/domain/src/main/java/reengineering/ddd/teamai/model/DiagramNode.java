package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.NodeDescription;

public class DiagramNode implements Entity<String, NodeDescription> {
  private String identity;
  private NodeDescription description;
  private String diagramId;

  public DiagramNode(String identity, String diagramId, NodeDescription description) {
    this.identity = identity;
    this.diagramId = diagramId;
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

  public String getDiagramId() {
    return diagramId;
  }
}
