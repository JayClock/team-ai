package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
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
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.NodeDescription;
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
    @DisplayName("should delegate addMember to members association")
    void shouldDelegateAddMember() {
      String userId = "user-123";
      String role = "EDITOR";
      MemberDescription description = new MemberDescription(new Ref<>(userId), role);
      Member expectedMember = mock(Member.class);

      when(members.addMember(description)).thenReturn(expectedMember);

      Member result = project.addMember(description);

      assertSame(expectedMember, result);
      verify(members).addMember(description);
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
      DiagramDescription diagramDescription =
          new DiagramDescription("Test Diagram", DiagramType.CLASS, Viewport.defaultViewport());
      Diagram expectedDiagram = mock(Diagram.class);

      when(diagrams.add(diagramDescription)).thenReturn(expectedDiagram);

      Diagram result = project.addDiagram(diagramDescription);

      assertSame(expectedDiagram, result);
      verify(diagrams).add(diagramDescription);
    }

    @Test
    @DisplayName("should delegate commit diagram draft to diagrams association")
    void shouldDelegateCommitDiagramDraft() {
      String diagramId = "diagram-1";
      NodeDescription nodeDescription =
          new NodeDescription(
              "class-node", new Ref<>("entity-1"), null, 100.0, 200.0, 300, 200, null, null);
      Project.Diagrams.DraftNode draftNode =
          new Project.Diagrams.DraftNode("node-1", nodeDescription);
      Project.Diagrams.DraftEdge draftEdge = new Project.Diagrams.DraftEdge("node-1", "node-1");
      Project.Diagrams.CommitDraftResult expected =
          new Project.Diagrams.CommitDraftResult(List.of(), List.of());

      when(diagrams.commitDraft(diagramId, List.of(draftNode), List.of(draftEdge)))
          .thenReturn(expected);

      Project.Diagrams.CommitDraftResult result =
          project.commitDiagramDraft(diagramId, List.of(draftNode), List.of(draftEdge));

      assertSame(expected, result);
      verify(diagrams).commitDraft(diagramId, List.of(draftNode), List.of(draftEdge));
    }
  }
}
