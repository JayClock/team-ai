package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.ConversationDescription;

public class Conversation implements Entity<String, ConversationDescription> {
  private String identity;
  private ConversationDescription description;

  public Conversation(String identity, ConversationDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public Conversation() {
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public ConversationDescription getDescription() {
    return description;
  }
}
