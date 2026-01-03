package reengineering.ddd.teamai.model;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
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

  public Flux<String> sendMessage(MessageDescription description, ModelProvider modelProvider) {
    return Mono.fromCallable(() -> saveMessage(description))
      .flatMapMany(savedMessage -> {
        StringBuilder aiResponseBuilder = new StringBuilder();
        return modelProvider.sendMessage(description.content())
          .doOnNext(aiResponseBuilder::append)
          .doOnComplete(() -> {
            String fullAiResponse = aiResponseBuilder.toString();
            saveMessage(new MessageDescription("assistant", fullAiResponse));
          });
      });
  }

  public interface Messages extends HasMany<String, Message> {
    Message saveMessage(MessageDescription description);
  }

  /**
   * Interface for model providers, used to abstract different AI model services
   */
  public interface ModelProvider {
    /**
     * Send message to AI model and get response stream
     *
     * @param message User message content
     * @return Response stream from AI model
     */
    Flux<String> sendMessage(String message);
  }
}
