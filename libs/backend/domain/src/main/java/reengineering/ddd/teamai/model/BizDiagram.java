package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.BizDiagramDescription;

public class BizDiagram implements Entity<String, BizDiagramDescription> {
  private String identity;
  private BizDiagramDescription description;

  public BizDiagram(String identity, BizDiagramDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private BizDiagram() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public BizDiagramDescription getDescription() {
    return description;
  }
}
