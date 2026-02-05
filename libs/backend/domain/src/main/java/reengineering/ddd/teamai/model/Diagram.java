package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.DiagramDescription;

public class Diagram implements Entity<String, DiagramDescription> {
  private String identity;
  private DiagramDescription description;
  private String projectId;

  public Diagram(String identity, String projectId, DiagramDescription description) {
    this.identity = identity;
    this.projectId = projectId;
    this.description = description;
  }

  private Diagram() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramDescription getDescription() {
    return description;
  }

  public String getProjectId() {
    return projectId;
  }
}
