package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.mybatis.mappers.ProjectConversationsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectConversationsMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private ProjectConversationsMapper conversationsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int conversationId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId, "domain model content");
    testData.insertConversationWithProject(conversationId, "Conversation Title", userId, projectId);
  }

  @Test
  void should_find_conversation_by_project_and_id() {
    Conversation conversation =
        conversationsMapper.findConversationByProjectAndId(projectId, conversationId);
    assertEquals(String.valueOf(conversationId), conversation.getIdentity());
    assertEquals("Conversation Title", conversation.getDescription().title());
  }

  @Test
  void should_assign_messages_association_of_conversation() {
    Conversation conversation =
        conversationsMapper.findConversationByProjectAndId(projectId, conversationId);
    assertEquals(0, conversation.messages().findAll().size());
  }

  @Test
  public void should_add_conversation_to_database() {
    IdHolder idHolder = new IdHolder();
    conversationsMapper.insertConversation(
        idHolder, projectId, new ConversationDescription("New Conversation"));
    Conversation conversation =
        conversationsMapper.findConversationByProjectAndId(projectId, idHolder.id());
    assertEquals("New Conversation", conversation.getDescription().title());
  }

  @Test
  public void should_count_conversations_by_project() {
    int count = conversationsMapper.countConversationsByProject(projectId);
    assertEquals(1, count);
  }

  @Test
  public void should_find_conversations_by_project_id_with_pagination() {
    List<Conversation> conversations =
        conversationsMapper.findConversationsByProjectId(projectId, 0, 10);
    assertEquals(1, conversations.size());
    assertEquals(String.valueOf(conversationId), conversations.get(0).getIdentity());
  }
}
