package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.mybatis.mappers.ConversationMessagesMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class MessagesMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private ConversationMessagesMapper messagesMapper;

  private final int userId = id();
  private final int conversationId = id();
  private final int messageId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertConversation(conversationId, "title" + conversationId, userId);
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
