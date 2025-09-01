package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.ContextDescription;

public class Context implements Entity<String, ContextDescription> {
  private String identity;
  private ContextDescription description;

  public Context(String identity, ContextDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private Context() {
  }

  @Override
  public String getIdentity() {
    return this.identity;
  }

  @Override
  public ContextDescription getDescription() {
    return this.description;
  }
}

