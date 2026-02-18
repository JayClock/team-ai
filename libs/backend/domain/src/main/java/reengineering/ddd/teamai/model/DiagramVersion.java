package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.DiagramVersionDescription;

public class DiagramVersion implements Entity<String, DiagramVersionDescription> {
  private String identity;
  private DiagramVersionDescription description;

  public DiagramVersion(String identity, DiagramVersionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private DiagramVersion() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramVersionDescription getDescription() {
    return description;
  }
}
