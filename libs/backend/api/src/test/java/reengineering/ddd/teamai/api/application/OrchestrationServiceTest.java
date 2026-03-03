package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.OrchestrationStepDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.OrchestrationStep;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

class OrchestrationServiceTest {
  private Project project;
  private OrchestrationRuntimeService runtimeService;
  private OrchestrationService service;

  private Project.Members members;
  private Project.Conversations conversations;
  private Project.LogicalEntities logicalEntities;
  private Project.Diagrams diagrams;
  private Project.Agents agents;
  private Project.Tasks tasks;
  private Project.AgentEvents events;
  private Project.OrchestrationSessions orchestrationSessions;

  @BeforeEach
  void setUp() {
    runtimeService = mock(OrchestrationRuntimeService.class);
    service = new OrchestrationService(runtimeService, 2);

    members = mock(Project.Members.class);
    conversations = mock(Project.Conversations.class);
    logicalEntities = mock(Project.LogicalEntities.class);
    diagrams = mock(Project.Diagrams.class);
    agents = mock(Project.Agents.class);
    tasks = mock(Project.Tasks.class);
    events = mock(Project.AgentEvents.class);
    orchestrationSessions = mock(Project.OrchestrationSessions.class);

    project =
        new Project(
            "project-1",
            new ProjectDescription("project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            orchestrationSessions);
  }

  @Test
  void should_generate_three_steps_and_execute_in_sequence() {
    Agent coordinator = coordinator();
    Agent implementer = implementer();
    Task createdTask = task();
    OrchestrationSession session = session("session-1");

    when(agents.findAll()).thenReturn(manyOf(coordinator, implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(createdTask));
    when(agents.findByIdentity("agent-routa")).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity("agent-crafter")).thenReturn(Optional.of(implementer));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(session);
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(session));

    OrchestrationStep step1 = step("step-1", "Clarify");
    OrchestrationStep step2 = step("step-2", "Implement");
    OrchestrationStep step3 = step("step-3", "Validate");
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(1), any(OrchestrationStepDescription.class)))
        .thenReturn(step1);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(2), any(OrchestrationStepDescription.class)))
        .thenReturn(step2);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(3), any(OrchestrationStepDescription.class)))
        .thenReturn(step3);
    when(orchestrationSessions.findSteps("session-1")).thenReturn(List.of(step1, step2, step3));

    doNothing()
        .when(runtimeService)
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));

    OrchestrationService.StartCommand command =
        new OrchestrationService.StartCommand(
            null,
            "goal",
            "title",
            null,
            List.of(),
            List.of(),
            null,
            null,
            Instant.parse("2026-03-02T12:00:00Z"));

    OrchestrationSession result = service.start(project, command);

    verify(runtimeService, times(3))
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));
    verify(orchestrationSessions, times(3))
        .createStep(eq("session-1"), anyInt(), any(OrchestrationStepDescription.class));
    verify(orchestrationSessions, times(6))
        .updateStepStatus(
            eq("session-1"),
            any(String.class),
            any(OrchestrationStepDescription.Status.class),
            any(),
            any(),
            any());
    verify(orchestrationSessions, times(1))
        .updateStatus(
            eq("session-1"),
            eq(OrchestrationSessionDescription.Status.COMPLETED),
            any(),
            any(),
            eq(null));
    assertThat(result.getIdentity()).isEqualTo("session-1");
  }

  @Test
  void should_retry_once_and_rollback_failed_step_then_recover() {
    Agent coordinator = coordinator();
    Agent implementer = implementer();
    Task createdTask = task();
    OrchestrationSession session = session("session-1");

    when(agents.findAll()).thenReturn(manyOf(coordinator, implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(createdTask));
    when(agents.findByIdentity("agent-routa")).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity("agent-crafter")).thenReturn(Optional.of(implementer));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(session);
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(session));

    OrchestrationStep step1 = step("step-1", "Clarify");
    OrchestrationStep step2 = step("step-2", "Implement");
    OrchestrationStep step3 = step("step-3", "Validate");
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(1), any(OrchestrationStepDescription.class)))
        .thenReturn(step1);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(2), any(OrchestrationStepDescription.class)))
        .thenReturn(step2);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(3), any(OrchestrationStepDescription.class)))
        .thenReturn(step3);
    when(orchestrationSessions.findSteps("session-1")).thenReturn(List.of(step1, step2, step3));

    doThrow(new AgentRuntimeException("runtime fail"))
        .doNothing()
        .doNothing()
        .doNothing()
        .when(runtimeService)
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));

    OrchestrationService.StartCommand command =
        new OrchestrationService.StartCommand(
            null,
            "goal",
            "title",
            null,
            List.of(),
            List.of(),
            null,
            null,
            Instant.parse("2026-03-02T12:00:00Z"));

    OrchestrationSession result = service.start(project, command);

    verify(runtimeService, times(4))
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));
    verify(orchestrationSessions, times(1))
        .updateStepStatus(
            eq("session-1"),
            eq("step-1"),
            eq(OrchestrationStepDescription.Status.PENDING),
            eq(null),
            eq(null),
            eq(null));
    verify(orchestrationSessions, times(1))
        .updateStatus(
            eq("session-1"),
            eq(OrchestrationSessionDescription.Status.COMPLETED),
            any(),
            any(),
            eq(null));
    assertThat(result.getIdentity()).isEqualTo("session-1");
  }

  @Test
  void should_mark_session_failed_when_retry_exhausted() {
    Agent coordinator = coordinator();
    Agent implementer = implementer();
    Task createdTask = task();
    OrchestrationSession session = session("session-1");

    when(agents.findAll()).thenReturn(manyOf(coordinator, implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity("task-1")).thenReturn(Optional.of(createdTask));
    when(agents.findByIdentity("agent-routa")).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity("agent-crafter")).thenReturn(Optional.of(implementer));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(session);
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(session));

    OrchestrationStep step1 = step("step-1", "Clarify");
    OrchestrationStep step2 = step("step-2", "Implement");
    OrchestrationStep step3 = step("step-3", "Validate");
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(1), any(OrchestrationStepDescription.class)))
        .thenReturn(step1);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(2), any(OrchestrationStepDescription.class)))
        .thenReturn(step2);
    when(orchestrationSessions.createStep(
            eq("session-1"), eq(3), any(OrchestrationStepDescription.class)))
        .thenReturn(step3);
    when(orchestrationSessions.findSteps("session-1")).thenReturn(List.of(step1, step2, step3));

    doThrow(new AgentRuntimeException("runtime always fails"))
        .when(runtimeService)
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));

    OrchestrationService.StartCommand command =
        new OrchestrationService.StartCommand(
            null,
            "goal",
            "title",
            null,
            List.of(),
            List.of(),
            null,
            null,
            Instant.parse("2026-03-02T12:00:00Z"));

    assertThrows(AgentRuntimeException.class, () -> service.start(project, command));

    verify(runtimeService, times(2))
        .onSessionStarted(eq(project), any(OrchestrationSession.class), any(Instant.class));
    verify(orchestrationSessions, times(1))
        .updateStepStatus(
            eq("session-1"),
            eq("step-1"),
            eq(OrchestrationStepDescription.Status.FAILED),
            eq(null),
            any(),
            any(String.class));
    verify(orchestrationSessions, times(1))
        .updateStatus(
            eq("session-1"),
            eq(OrchestrationSessionDescription.Status.FAILED),
            any(),
            any(),
            any(String.class));
  }

  @Test
  void should_delegate_cancel_to_runtime_service_and_update_status() {
    OrchestrationSession session = session("session-1");
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(session));

    OrchestrationSession result =
        service.cancel(project, session, "manual cancel", Instant.parse("2026-03-02T12:10:00Z"));

    verify(runtimeService, times(1)).onSessionCancelled("session-1");
    verify(orchestrationSessions, times(1))
        .updateStatus(
            "session-1",
            OrchestrationSessionDescription.Status.CANCELLED,
            null,
            Instant.parse("2026-03-02T12:10:00Z"),
            "manual cancel");
    assertThat(result.getIdentity()).isEqualTo("session-1");
  }

  @Test
  void should_replay_start_command_when_request_id_matches_existing_session() {
    OrchestrationSession existing =
        new OrchestrationSession(
            "session-existing",
            new OrchestrationSessionDescription(
                "goal",
                OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));
    when(orchestrationSessions.findByStartRequestId("req-1")).thenReturn(Optional.of(existing));

    OrchestrationService.StartCommand command =
        new OrchestrationService.StartCommand(
            "req-1", "goal", "title", null, List.of(), List.of(), null, null, Instant.now());

    OrchestrationSession replayed = service.start(project, command);

    verify(orchestrationSessions, times(0)).create(any(OrchestrationSessionDescription.class));
    verify(runtimeService, times(0)).onSessionStarted(any(), any(), any());
    assertThat(replayed.getIdentity()).isEqualTo("session-existing");
  }

  private Agent coordinator() {
    return new Agent(
        "agent-routa",
        new AgentDescription(
            "Coordinator",
            AgentDescription.Role.ROUTA,
            "SMART",
            AgentDescription.Status.PENDING,
            null));
  }

  private Agent implementer() {
    return new Agent(
        "agent-crafter",
        new AgentDescription(
            "Crafter",
            AgentDescription.Role.CRAFTER,
            "SMART",
            AgentDescription.Status.PENDING,
            null));
  }

  private Task task() {
    return new Task(
        "task-1",
        new TaskDescription(
            "title",
            "goal",
            null,
            List.of(),
            List.of(),
            TaskDescription.Status.PENDING,
            null,
            null,
            null,
            null,
            null));
  }

  private OrchestrationSession session(String sessionId) {
    return new OrchestrationSession(
        sessionId,
        new OrchestrationSessionDescription(
            "goal",
            OrchestrationSessionDescription.Status.RUNNING,
            new Ref<>("agent-routa"),
            new Ref<>("agent-crafter"),
            new Ref<>("task-1"),
            null,
            Instant.parse("2026-03-02T12:00:00Z"),
            null,
            null));
  }

  private OrchestrationStep step(String id, String title) {
    return new OrchestrationStep(
        id,
        new OrchestrationStepDescription(
            title,
            title + " objective",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>("task-1"),
            new Ref<>("agent-crafter"),
            null,
            null,
            null));
  }

  private Many<Agent> manyOf(Agent... values) {
    List<Agent> list = List.of(values);
    return new Many<>() {
      @Override
      public int size() {
        return list.size();
      }

      @Override
      public Many<Agent> subCollection(int from, int to) {
        return manyOf(list.subList(from, to).toArray(new Agent[0]));
      }

      @Override
      public Stream<Agent> stream() {
        return list.stream();
      }

      @Override
      public Iterator<Agent> iterator() {
        return list.iterator();
      }
    };
  }
}
