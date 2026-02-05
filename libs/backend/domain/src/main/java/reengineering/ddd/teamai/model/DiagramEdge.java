package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.EdgeDescription;

public class DiagramEdge implements Entity<String, EdgeDescription> {
  private String identity;
  private EdgeDescription description;
  private String diagramId;

  public DiagramEdge(String identity, String diagramId, EdgeDescription description) {
    this.identity = identity;
    this.diagramId = diagramId;
    this.description = description;
  }

  private DiagramEdge() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public EdgeDescription getDescription() {
    return description;
  }

  public String getDiagramId() {
    return diagramId;
  }
}
