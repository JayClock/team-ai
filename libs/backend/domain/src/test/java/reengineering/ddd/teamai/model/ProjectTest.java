package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.ProjectDescription;

@ExtendWith(MockitoExtension.class)
public class ProjectTest {
  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;

  private Project project;
  private ProjectDescription projectDescription;

  @BeforeEach
  public void setUp() {
    projectDescription = new ProjectDescription("Test Project", "Test Domain Model");
    project = new Project("project-1", projectDescription, members, conversations);
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

  @Nested
  @DisplayName("Members association")
  class MembersAssociation {

    @Test
    @DisplayName("should return Members association object")
    void shouldReturnMembersAssociation() {
      var result = project.members();

      assertSame(members, result);
    }

    @Test
    @DisplayName("should delegate invite to members association")
    void shouldDelegateInvite() {
      String userId = "user-123";
      Project.Role role = Project.Role.EDITOR;
      Member expectedMember = mock(Member.class);

      when(members.invite(userId, role.name())).thenReturn(expectedMember);

      Member result = project.invite(userId, role);

      assertSame(expectedMember, result);
      verify(members).invite(userId, role.name());
    }
  }

  @Nested
  @DisplayName("Conversations association")
  class ConversationsAssociation {

    @Test
    @DisplayName("should return Conversations association object")
    void shouldReturnConversationsAssociation() {
      var result = project.conversations();

      assertSame(conversations, result);
    }

    @Test
    @DisplayName("should delegate add conversation to conversations association")
    void shouldDelegateAddConversation() {
      ConversationDescription conversationDescription =
          new ConversationDescription("Test Conversation");
      Conversation expectedConversation = new Conversation("conv-1", conversationDescription, null);
      when(conversations.add(conversationDescription)).thenReturn(expectedConversation);

      Conversation result = project.add(conversationDescription);

      assertSame(expectedConversation, result);
      verify(conversations).add(conversationDescription);
    }

    @Test
    @DisplayName("should delegate delete conversation to conversations association")
    void shouldDelegateDeleteConversation() {
      String conversationId = "conv-1";

      project.deleteConversation(conversationId);

      verify(conversations).delete(conversationId);
    }
  }
}
