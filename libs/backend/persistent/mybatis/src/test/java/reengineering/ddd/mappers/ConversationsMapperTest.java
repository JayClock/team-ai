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
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.mybatis.mappers.UserConversationsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ConversationsMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private UserConversationsMapper conversationsMapper;

  private final int userId = id();
  private final int conversationId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertConversation(conversationId, "title" + conversationId, userId);
  }

  @Test
  void should_find_conversation_by_user_and_id() {
    Conversation conversation =
        conversationsMapper.findConversationByUserAndId(userId, conversationId);
    assertEquals(String.valueOf(conversationId), conversation.getIdentity());
  }

  @Test
  void should_assign_messages_association_of_conversation() {
    Conversation conversation =
        conversationsMapper.findConversationByUserAndId(userId, conversationId);
    assertEquals(1, conversation.messages().findAll().size());
  }

  @Test
  public void should_add_conversation_to_database() {
    IdHolder idHolder = new IdHolder();
    conversationsMapper.insertConversation(idHolder, userId, new ConversationDescription("title"));
    Conversation conversation =
        conversationsMapper.findConversationByUserAndId(userId, idHolder.id());
    assertEquals(conversation.getIdentity(), String.valueOf(idHolder.id()));
  }
}
