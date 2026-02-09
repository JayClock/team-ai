package com.businessdrivenai.domain.model;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.archtype.HasMany;
import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.description.MessageDescription;
import jakarta.validation.constraints.NotNull;
import reactor.core.publisher.Flux;

public class Conversation implements Entity<String, ConversationDescription> {
  private String identity;
  private ConversationDescription description;
  private Messages messages;

  public Conversation(String identity, ConversationDescription description, Messages messages) {
    this.identity = identity;
    this.description = description;
    this.messages = messages;
  }

  public Conversation() {}

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

  public Flux<String> sendMessage(
      MessageDescription description, ModelProvider modelProvider, String apiKey) {
    saveMessage(description);
    return modelProvider.sendMessage(description.content(), apiKey);
  }

  public interface Messages extends HasMany<String, Message> {
    Message saveMessage(MessageDescription description);
  }

  /** Interface for model providers, used to abstract different AI model services */
  public interface ModelProvider {
    /**
     * Send message to AI model and get response stream
     *
     * @param message User message content
     * @param apiKey API key for the AI model service
     * @return Response stream from AI model
     */
    Flux<String> sendMessage(String message, String apiKey);
  }

  public static class ConversationChange {
    @NotNull() private String title;

    public String getTitle() {
      return title;
    }

    public void setTitle(String title) {
      this.title = title;
    }
  }
}
