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
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;

@ExtendWith(MockitoExtension.class)
public class ProjectTest {
  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;

  private Project project;
  private ProjectDescription projectDescription;

  @BeforeEach
  public void setUp() {
    projectDescription = new ProjectDescription("Test Project");
    project =
        new Project(
            "project-1", projectDescription, members, conversations, logicalEntities, diagrams);
  }

  @Test
  public void should_return_identity() {
    assertEquals("project-1", project.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(projectDescription, project.getDescription());
    assertEquals("Test Project", project.getDescription().name());
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

  @Nested
  @DisplayName("LogicalEntities association")
  class LogicalEntitiesAssociation {

    @Test
    @DisplayName("should return LogicalEntities association object")
    void shouldReturnLogicalEntitiesAssociation() {
      var result = project.logicalEntities();

      assertSame(logicalEntities, result);
    }

    @Test
    @DisplayName("should delegate add logical entity to logical entities association")
    void shouldDelegateAddLogicalEntity() {
      LogicalEntityDescription entityDescription = mock(LogicalEntityDescription.class);
      LogicalEntity expectedEntity = mock(LogicalEntity.class);

      when(logicalEntities.add(entityDescription)).thenReturn(expectedEntity);

      LogicalEntity result = project.addLogicalEntity(entityDescription);

      assertSame(expectedEntity, result);
      verify(logicalEntities).add(entityDescription);
    }
  }

  @Nested
  @DisplayName("Diagrams association")
  class DiagramsAssociation {

    @Test
    @DisplayName("should return Diagrams association object")
    void shouldReturnDiagramsAssociation() {
      var result = project.diagrams();

      assertSame(diagrams, result);
    }

    @Test
    @DisplayName("should delegate add diagram to diagrams association")
    void shouldDelegateAddDiagram() {
      Ref<String> projectRef = new Ref<>("project-1");
      DiagramDescription diagramDescription =
          new DiagramDescription(
              "Test Diagram", DiagramType.CLASS, Viewport.defaultViewport(), projectRef);
      Diagram expectedDiagram = mock(Diagram.class);

      when(diagrams.add(diagramDescription)).thenReturn(expectedDiagram);

      Diagram result = project.addDiagram(diagramDescription);

      assertSame(expectedDiagram, result);
      verify(diagrams).add(diagramDescription);
    }
  }
}
