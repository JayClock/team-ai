package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.PromptDescription;

public class Prompt implements Entity<String, PromptDescription> {
  private String identity;
  private PromptDescription description;

  public Prompt(String identity, PromptDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public Prompt() {
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public PromptDescription getDescription() {
    return description;
  }
}
