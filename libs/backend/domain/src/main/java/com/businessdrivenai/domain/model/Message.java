package com.businessdrivenai.domain.model;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.domain.description.MessageDescription;

public class Message implements Entity<String, MessageDescription> {
  private String identity;
  private MessageDescription description;

  public Message(String identity, MessageDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public Message() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MessageDescription getDescription() {
    return description;
  }
}
