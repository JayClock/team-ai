package com.businessdrivenai.domain.model;

import static org.junit.jupiter.api.Assertions.*;

import com.businessdrivenai.domain.description.MessageDescription;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class MessageTest {
  private Message message;
  private MessageDescription description;

  @BeforeEach
  public void setUp() {
    description = new MessageDescription("user", "Hello, AI!");
    message = new Message("msg-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("msg-1", message.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, message.getDescription());
  }

  @Test
  public void should_return_role_from_description() {
    assertEquals("user", message.getDescription().role());
  }

  @Test
  public void should_return_content_from_description() {
    assertEquals("Hello, AI!", message.getDescription().content());
  }

  @Test
  public void should_create_user_message() {
    MessageDescription userMessage = new MessageDescription("user", "User input");
    Message msg = new Message("msg-2", userMessage);

    assertEquals("user", msg.getDescription().role());
    assertEquals("User input", msg.getDescription().content());
  }

  @Test
  public void should_create_assistant_message() {
    MessageDescription assistantMessage = new MessageDescription("assistant", "AI response");
    Message msg = new Message("msg-3", assistantMessage);

    assertEquals("assistant", msg.getDescription().role());
    assertEquals("AI response", msg.getDescription().content());
  }

  @Test
  public void should_create_system_message() {
    MessageDescription systemMessage = new MessageDescription("system", "System prompt");
    Message msg = new Message("msg-4", systemMessage);

    assertEquals("system", msg.getDescription().role());
    assertEquals("System prompt", msg.getDescription().content());
  }
}
