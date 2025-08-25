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

  public Message saveMessage(MessageDescription description) {
    return messages.saveMessage(description);
  }

  public Flux<String> sendMessage(String message) {
    return messages.sendMessage(message);
  }

  public interface Messages extends HasMany<String, Message> {
    Message saveMessage(MessageDescription description);

    Flux<String> sendMessage(String message);
  }
}
