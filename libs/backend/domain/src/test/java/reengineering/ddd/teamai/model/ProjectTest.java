package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

@ExtendWith(MockitoExtension.class)
public class ProjectTest {
  @Mock private Project.Conversations conversations;

  private Project project;
  private ProjectDescription projectDescription;

  @BeforeEach
  public void setUp() {
    projectDescription = new ProjectDescription("Test Project", "Test Domain Model");
    project = new Project("project-1", projectDescription, conversations);
  }

  @Test
  public void should_return_identity() {
    assertEquals("project-1", project.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(projectDescription, project.getDescription());
    assertEquals("Test Project", project.getDescription().name());
    assertEquals("Test Domain Model", project.getDescription().domainModel());
  }

  @Test
  public void should_return_conversations_association() {
    assertSame(conversations, project.conversations());
  }

  @Test
  public void should_delegate_add_conversation_to_conversations_association() {
    ConversationDescription conversationDescription =
        new ConversationDescription("Test Conversation");
    Conversation expectedConversation = new Conversation("conv-1", conversationDescription, null);
    when(conversations.add(conversationDescription)).thenReturn(expectedConversation);

    Conversation result = project.add(conversationDescription);

    assertSame(expectedConversation, result);
    verify(conversations).add(conversationDescription);
  }

  @Test
  public void should_delegate_delete_conversation_to_conversations_association() {
    String conversationId = "conv-1";

    project.deleteConversation(conversationId);

    verify(conversations).delete(conversationId);
  }

  @Test
  public void should_create_project_with_conversations_only() {
    Project projectWithConversationsOnly =
        new Project("project-2", projectDescription, conversations);

    assertEquals("project-2", projectWithConversationsOnly.getIdentity());
    assertSame(conversations, projectWithConversationsOnly.conversations());
  }
}
