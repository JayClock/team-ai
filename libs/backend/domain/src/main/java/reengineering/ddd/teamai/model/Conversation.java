package reengineering.ddd.teamai.model;

import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;

public class Conversation implements Entity<String, ConversationDescription> {
  private String identity;
  private ConversationDescription description;
  private Messages messages;

  public Conversation(String identity, ConversationDescription description, Messages messages) {
    this.identity = identity;
    this.description = description;
    this.messages = messages;
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

  public HasMany<String, Message> messages() {
    return messages;
  }

  public Message add(MessageDescription description) {
    return messages.add(description);
  }

  public Flux<String> sendMessage(MessageDescription description) {
    return messages.sendMessage(description);
  }

  public interface Messages extends HasMany<String, Message> {
    Message add(MessageDescription description);

    Flux<String> sendMessage(MessageDescription description);
  }
}
