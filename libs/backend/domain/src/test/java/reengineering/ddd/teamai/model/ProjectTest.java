package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentDescription.Role;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.AgentEventDescription.Type;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskDescription.Status;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.description.Viewport;

@ExtendWith(MockitoExtension.class)
public class ProjectTest {
  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.KnowledgeGraphPublisher knowledgeGraphPublisher;

  private Project project;
  private ProjectDescription projectDescription;

  @BeforeEach
  public void setUp() {
    projectDescription = new ProjectDescription("Test Project");
    project =
        new Project(
            "project-1",
            projectDescription,
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events);
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
          new DiagramDescription("Test Diagram", Diagram.Type.CLASS, Viewport.defaultViewport());
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
      Project.Diagrams.DraftEdge draftEdge =
          new Project.Diagrams.DraftEdge("node-1", "node-1", false);

      doNothing().when(diagrams).saveDiagram(diagramId, List.of(draftNode), List.of(draftEdge));
      project.saveDiagram(diagramId, List.of(draftNode), List.of(draftEdge));
      verify(diagrams).saveDiagram(diagramId, List.of(draftNode), List.of(draftEdge));
    }

    @Test
    @DisplayName("should delegate publish diagram to diagrams association")
    void shouldDelegatePublishDiagram() {
      String diagramId = "diagram-1";

      project.publishDiagram(diagramId, knowledgeGraphPublisher);

      verify(diagrams).publishDiagram(diagramId);
      verify(knowledgeGraphPublisher)
          .publish(
              argThat(
                  request ->
                      request != null
                          && "project-1".equals(request.projectId())
                          && diagramId.equals(request.diagramId())
                          && request.publishedAt() != null
                          && !request.publishedAt().isAfter(Instant.now())));
    }
  }

  @Nested
  @DisplayName("Agents association")
  class AgentsAssociation {

    @Test
    @DisplayName("should return Agents association object")
    void shouldReturnAgentsAssociation() {
      var result = project.agents();

      assertSame(agents, result);
    }

    @Test
    @DisplayName("should delegate createAgent to agents association")
    void shouldDelegateCreateAgent() {
      AgentDescription description =
          new AgentDescription(
              "Coordinator", Role.ROUTA, "SMART", AgentDescription.Status.PENDING, null);
      Agent expectedAgent = new Agent("agent-1", description);

      when(agents.create(description)).thenReturn(expectedAgent);

      Agent result = project.createAgent(description);

      assertSame(expectedAgent, result);
      verify(agents).create(description);
    }

    @Test
    @DisplayName("should delegate updateAgentStatus to agents association")
    void shouldDelegateUpdateAgentStatus() {
      project.updateAgentStatus(new Ref<>("agent-1"), AgentDescription.Status.ACTIVE);

      verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.ACTIVE);
    }
  }

  @Nested
  @DisplayName("Tasks association")
  class TasksAssociation {

    @Test
    @DisplayName("should return Tasks association object")
    void shouldReturnTasksAssociation() {
      var result = project.tasks();

      assertSame(tasks, result);
    }

    @Test
    @DisplayName("should delegate createTask to tasks association")
    void shouldDelegateCreateTask() {
      TaskDescription description =
          new TaskDescription(
              "Implement feature",
              "Build multi-agent domain support",
              "domain layer",
              List.of("Task model exists"),
              List.of("./gradlew :backend:domain:test"),
              reengineering.ddd.teamai.description.TaskDescription.Status.PENDING,
              null,
              null,
              null,
              null,
              null);
      Task expectedTask = new Task("task-1", description);

      when(tasks.create(description)).thenReturn(expectedTask);

      Task result = project.createTask(description);

      assertSame(expectedTask, result);
      verify(tasks).create(description);
    }

    @Test
    @DisplayName("should delegate task operations to tasks association")
    void shouldDelegateTaskOperations() {
      TaskReportDescription report =
          new TaskReportDescription("All acceptance criteria met", true, "tests passed");

      project.delegateTask("task-1", new Ref<>("agent-1"), new Ref<>("agent-parent"));
      project.updateTaskStatus("task-1", Status.REVIEW_REQUIRED, "waiting for GATE");
      project.reportTask("task-1", new Ref<>("agent-1"), report);

      verify(tasks).assign("task-1", new Ref<>("agent-1"), new Ref<>("agent-parent"));
      verify(tasks).updateStatus("task-1", Status.REVIEW_REQUIRED, "waiting for GATE");
      verify(tasks).report("task-1", new Ref<>("agent-1"), report);
    }
  }

  @Nested
  @DisplayName("Events association")
  class EventsAssociation {

    @Test
    @DisplayName("should return AgentEvents association object")
    void shouldReturnEventsAssociation() {
      var result = project.events();

      assertSame(events, result);
    }

    @Test
    @DisplayName("should delegate appendEvent to events association")
    void shouldDelegateAppendEvent() {
      AgentEventDescription description =
          new AgentEventDescription(
              Type.TASK_ASSIGNED,
              new Ref<>("agent-1"),
              new Ref<>("task-1"),
              "delegated",
              Instant.parse("2026-01-01T00:00:00Z"));
      AgentEvent expectedEvent = new AgentEvent("event-1", description);

      when(events.append(description)).thenReturn(expectedEvent);

      AgentEvent result = project.appendEvent(description);

      assertSame(expectedEvent, result);
      verify(events).append(description);
    }
  }

  @Nested
  @DisplayName("Multi-agent orchestration")
  class MultiAgentOrchestration {

    @Test
    @DisplayName("should delegate task for execution and emit orchestration events")
    void shouldDelegateTaskForExecution() {
      Task task =
          new Task(
              "task-1",
              new TaskDescription(
                  "Implement API",
                  "Build endpoint",
                  "api",
                  List.of("done"),
                  List.of("test"),
                  Status.PENDING,
                  null,
                  null,
                  null,
                  null,
                  null));
      Agent assignee =
          new Agent(
              "agent-1",
              new AgentDescription(
                  "Crafter", Role.CRAFTER, "SMART", AgentDescription.Status.PENDING, null));
      Agent caller =
          new Agent(
              "agent-2",
              new AgentDescription(
                  "Routa", Role.ROUTA, "SMART", AgentDescription.Status.ACTIVE, null));

      when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(task));
      when(agents.findByIdentity("agent-1")).thenReturn(Optional.of(assignee));
      when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(caller));

      Instant occurredAt = Instant.parse("2026-03-02T12:00:00Z");
      project.delegateTaskForExecution(
          "task-1", new Ref<>("agent-1"), new Ref<>("agent-2"), occurredAt);

      verify(tasks).assign("task-1", new Ref<>("agent-1"), new Ref<>("agent-2"));
      verify(tasks).updateStatus("task-1", Status.IN_PROGRESS, null);
      verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.ACTIVE);

      ArgumentCaptor<AgentEventDescription> eventCaptor =
          ArgumentCaptor.forClass(AgentEventDescription.class);
      verify(events, times(3)).append(eventCaptor.capture());
      assertEquals(
          List.of(Type.TASK_ASSIGNED, Type.TASK_STATUS_CHANGED, Type.AGENT_ACTIVATED),
          eventCaptor.getAllValues().stream().map(AgentEventDescription::type).toList());
      assertTrue(
          eventCaptor.getAllValues().stream()
              .allMatch(event -> occurredAt.equals(event.occurredAt())));
    }

    @Test
    @DisplayName("should submit task for review")
    void shouldSubmitTaskForReview() {
      Ref<String> implementer = new Ref<>("agent-1");
      Task task =
          new Task(
              "task-1",
              new TaskDescription(
                  "Implement API",
                  "Build endpoint",
                  "api",
                  List.of("done"),
                  List.of("test"),
                  Status.IN_PROGRESS,
                  implementer,
                  new Ref<>("agent-2"),
                  null,
                  null,
                  null));
      Agent assignee =
          new Agent(
              "agent-1",
              new AgentDescription(
                  "Crafter", Role.CRAFTER, "SMART", AgentDescription.Status.ACTIVE, null));

      when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(task));
      when(agents.findByIdentity("agent-1")).thenReturn(Optional.of(assignee));

      project.submitTaskForReview(
          "task-1", implementer, "Implemented all acceptance criteria", Instant.now());

      verify(tasks)
          .updateStatus("task-1", Status.REVIEW_REQUIRED, "Implemented all acceptance criteria");
      verify(agents).updateStatus(implementer, AgentDescription.Status.COMPLETED);
      verify(events, times(3)).append(any(AgentEventDescription.class));
    }

    @Test
    @DisplayName("should approve reviewed task and complete implementer")
    void shouldApproveTask() {
      Ref<String> implementer = new Ref<>("agent-1");
      Ref<String> reviewer = new Ref<>("agent-2");
      Task task =
          new Task(
              "task-1",
              new TaskDescription(
                  "Implement API",
                  "Build endpoint",
                  "api",
                  List.of("done"),
                  List.of("test"),
                  Status.REVIEW_REQUIRED,
                  implementer,
                  new Ref<>("agent-parent"),
                  "Ready for verification",
                  null,
                  null));
      Agent gate =
          new Agent(
              "agent-2",
              new AgentDescription(
                  "Gate", Role.GATE, "SMART", AgentDescription.Status.ACTIVE, null));

      when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(task));
      when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(gate));

      project.approveTask("task-1", reviewer, "verification passed", Instant.now());

      verify(tasks)
          .report(
              "task-1",
              reviewer,
              new TaskReportDescription("Verification approved", true, "verification passed"));
      verify(tasks).updateStatus("task-1", Status.COMPLETED, "Ready for verification");
      verify(agents).updateStatus(reviewer, AgentDescription.Status.COMPLETED);
      verify(agents).updateStatus(implementer, AgentDescription.Status.COMPLETED);
      verify(events, times(5)).append(any(AgentEventDescription.class));
    }

    @Test
    @DisplayName("should reject fix request from non-reviewer role")
    void shouldRejectFixRequestForInvalidRole() {
      Ref<String> reviewer = new Ref<>("agent-2");
      Task task =
          new Task(
              "task-1",
              new TaskDescription(
                  "Implement API",
                  "Build endpoint",
                  "api",
                  List.of("done"),
                  List.of("test"),
                  Status.REVIEW_REQUIRED,
                  new Ref<>("agent-1"),
                  new Ref<>("agent-parent"),
                  "Ready for verification",
                  null,
                  null));
      Agent crafter =
          new Agent(
              "agent-2",
              new AgentDescription(
                  "Crafter", Role.CRAFTER, "SMART", AgentDescription.Status.ACTIVE, null));

      when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(task));
      when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(crafter));

      IllegalStateException ex =
          assertThrows(
              IllegalStateException.class,
              () ->
                  project.requestTaskFix(
                      "task-1",
                      reviewer,
                      "verification failed",
                      Instant.parse("2026-03-02T12:00:00Z")));

      assertTrue(ex.getMessage().contains("reviewerAgent role"));
      verify(tasks, never()).report(anyString(), any(), any());
    }
  }
}
