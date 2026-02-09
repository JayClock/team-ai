package com.businessdrivenai.persistence.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.businessdrivenai.domain.description.MessageDescription;
import com.businessdrivenai.domain.model.Message;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.mybatis.mappers.ConversationMessagesMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import(TestContainerConfig.class)
public class ConversationMessagesMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ConversationMessagesMapper messagesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int conversationId = id();
  private final int messageId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "name");
    testData.insertConversation(conversationId, "Conversation Title", projectId);
    testData.insertMessage(messageId, conversationId, "role", "content");
  }

  @Test
  public void should_find_message_by_conversation_and_id() {
    Message message = messagesMapper.findMessageByConversationAndId(conversationId, messageId);
    assertEquals(String.valueOf(messageId), message.getIdentity());
  }

  @Test
  public void should_add_message_to_database() {
    IdHolder idHolder = new IdHolder();
    messagesMapper.insertMessage(
        idHolder, conversationId, new MessageDescription("role", "description"));
    Message message = messagesMapper.findMessageByConversationAndId(conversationId, idHolder.id());
    assertEquals(message.getIdentity(), String.valueOf(idHolder.id()));
  }
}
