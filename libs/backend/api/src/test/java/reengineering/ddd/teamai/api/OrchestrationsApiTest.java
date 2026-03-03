package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class OrchestrationsApiTest extends ApiTest {
  private Project project;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.OrchestrationSessions orchestrationSessions;

  @BeforeEach
  public void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Orchestration Project"),
            projectMembers,
            projectConversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            orchestrationSessions);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(agentRuntime.start(any(AgentRuntime.StartRequest.class)))
        .thenAnswer(
            invocation -> {
              AgentRuntime.StartRequest request = invocation.getArgument(0);
              return new AgentRuntime.SessionHandle(
                  "runtime-" + request.orchestrationId(),
                  request.orchestrationId(),
                  request.agentId(),
                  Instant.parse("2026-03-02T12:00:00Z"));
            });
    when(agentRuntime.send(
            any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenReturn(new AgentRuntime.SendResult("ok", Instant.parse("2026-03-02T12:00:01Z")));
  }

  @Test
  void should_start_orchestration_with_existing_agents() {
    Agent coordinator =
        new Agent(
            "agent-routa",
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    Agent implementer =
        new Agent(
            "agent-crafter",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));

    Task createdTask =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement feature",
                "Implement feature",
                null,
                List.of("tests pass"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));

    OrchestrationSession started =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Implement feature",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    when(agents.findAll()).thenReturn(new EntityList<>(coordinator, implementer));
    when(agents.findByIdentity(coordinator.getIdentity())).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity(implementer.getIdentity())).thenReturn(Optional.of(implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity(createdTask.getIdentity())).thenReturn(Optional.of(createdTask));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(started);
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(started));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setGoal("Implement feature");
    request.setAcceptanceCriteria(List.of("tests pass"));
    request.setVerificationCommands(List.of("./gradlew :backend:api:test"));
    request.setOccurredAt(Instant.parse("2026-03-02T12:00:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(201)
        .contentType(startsWith(ResourceTypes.ORCHESTRATION))
        .body("id", is("session-1"))
        .body("goal", is("Implement feature"))
        .body("state", is("RUNNING"))
        .body("coordinator.id", is("agent-routa"))
        .body("implementer.id", is("agent-crafter"))
        .body("task.id", is("task-1"));

    verify(tasks, times(1)).create(any(TaskDescription.class));
    verify(tasks, times(1))
        .assign(createdTask.getIdentity(), new Ref<>("agent-crafter"), new Ref<>("agent-routa"));
    verify(tasks, times(1))
        .updateStatus(createdTask.getIdentity(), TaskDescription.Status.IN_PROGRESS, null);
    verify(agents, times(1))
        .updateStatus(new Ref<>("agent-crafter"), AgentDescription.Status.ACTIVE);
    verify(agents, never()).create(any(AgentDescription.class));
    verify(events, times(5)).append(any(AgentEventDescription.class));
    verify(orchestrationSessions, times(1)).create(any(OrchestrationSessionDescription.class));
    verify(agentRuntime, times(1)).start(any(AgentRuntime.StartRequest.class));
    verify(agentRuntime, times(1))
        .send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class));
  }

  @Test
  void should_replay_start_orchestration_when_request_id_is_reused() {
    OrchestrationSession existing =
        new OrchestrationSession(
            "session-replay-1",
            new OrchestrationSessionDescription(
                "Implement feature",
                OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));
    when(orchestrationSessions.findByStartRequestId("req-start-1"))
        .thenReturn(Optional.of(existing));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setRequestId("req-start-1");
    request.setGoal("Implement feature");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.ORCHESTRATION))
        .body("id", is("session-replay-1"))
        .body("state", is("REVIEW_REQUIRED"));

    verify(tasks, never()).create(any(TaskDescription.class));
    verify(orchestrationSessions, never()).create(any(OrchestrationSessionDescription.class));
    verify(agentRuntime, never()).start(any(AgentRuntime.StartRequest.class));
  }

  @Test
  void should_create_default_agents_when_starting_orchestration_without_agents() {
    Agent coordinator =
        new Agent(
            "agent-routa-1",
            new AgentDescription(
                "Routa Coordinator",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    Agent implementer =
        new Agent(
            "agent-crafter-1",
            new AgentDescription(
                "Crafter Implementer",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));

    Task createdTask =
        new Task(
            "task-2",
            new TaskDescription(
                "Ship onboarding",
                "Ship onboarding",
                null,
                null,
                null,
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));

    OrchestrationSession started =
        new OrchestrationSession(
            "session-2",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa-1"),
                new Ref<>("agent-crafter-1"),
                new Ref<>("task-2"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    when(agents.findAll()).thenReturn(new EntityList<>());
    when(agents.create(any(AgentDescription.class)))
        .thenReturn(coordinator)
        .thenReturn(implementer);
    when(agents.findByIdentity(coordinator.getIdentity())).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity(implementer.getIdentity())).thenReturn(Optional.of(implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity(createdTask.getIdentity())).thenReturn(Optional.of(createdTask));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(started);
    when(orchestrationSessions.findByIdentity("session-2")).thenReturn(Optional.of(started));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setGoal("Ship onboarding");
    request.setOccurredAt(Instant.parse("2026-03-02T12:00:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is("session-2"))
        .body("coordinator.id", is("agent-routa-1"))
        .body("implementer.id", is("agent-crafter-1"))
        .body("task.id", is("task-2"));

    ArgumentCaptor<AgentDescription> captor = ArgumentCaptor.forClass(AgentDescription.class);
    verify(agents, times(2)).create(captor.capture());
    List<AgentDescription> createdAgents = captor.getAllValues();

    org.junit.jupiter.api.Assertions.assertEquals(
        AgentDescription.Role.ROUTA, createdAgents.get(0).role());
    org.junit.jupiter.api.Assertions.assertEquals(
        AgentDescription.Role.CRAFTER, createdAgents.get(1).role());

    verify(tasks, times(1))
        .assign(
            createdTask.getIdentity(), new Ref<>("agent-crafter-1"), new Ref<>("agent-routa-1"));
    verify(events, times(7)).append(any(AgentEventDescription.class));
    verify(orchestrationSessions, times(1)).create(any(OrchestrationSessionDescription.class));
    verify(agentRuntime, times(1)).start(any(AgentRuntime.StartRequest.class));
    verify(agentRuntime, times(1))
        .send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class));
  }

  @Test
  void should_mark_orchestration_failed_when_runtime_execution_fails() {
    Agent coordinator =
        new Agent(
            "agent-routa",
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    Agent implementer =
        new Agent(
            "agent-crafter",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    Task createdTask =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement feature",
                "Implement feature",
                null,
                List.of("tests pass"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));
    OrchestrationSession started =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Implement feature",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    when(agents.findAll()).thenReturn(new EntityList<>(coordinator, implementer));
    when(agents.findByIdentity(coordinator.getIdentity())).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity(implementer.getIdentity())).thenReturn(Optional.of(implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity(createdTask.getIdentity())).thenReturn(Optional.of(createdTask));
    when(orchestrationSessions.create(any(OrchestrationSessionDescription.class)))
        .thenReturn(started);
    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(started));
    when(agentRuntime.send(
            any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenThrow(new AgentRuntimeException("codex execution failed"));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setGoal("Implement feature");
    request.setOccurredAt(Instant.parse("2026-03-02T12:00:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(502);

    verify(orchestrationSessions, times(2))
        .updateStatus(
            "session-1",
            OrchestrationSessionDescription.Status.FAILED,
            null,
            Instant.parse("2026-03-02T12:00:00Z"),
            "codex execution failed");
    verify(orchestrationSessions, times(1))
        .updateStatus(
            "session-1", OrchestrationSessionDescription.Status.RUNNING, null, null, null);
    verify(tasks, times(2))
        .updateStatus("task-1", TaskDescription.Status.BLOCKED, "codex execution failed");
    verify(tasks, times(1))
        .updateStatus(eq("task-1"), eq(TaskDescription.Status.IN_PROGRESS), any(String.class));
    verify(events, times(9)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_list_orchestrations() {
    OrchestrationSession one =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));
    OrchestrationSession two =
        new OrchestrationSession(
            "session-2",
            new OrchestrationSessionDescription(
                "Verify release",
                OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-2"),
                new Ref<>("step-1"),
                Instant.parse("2026-03-02T12:05:00Z"),
                null,
                null));

    when(orchestrationSessions.findAll()).thenReturn(new EntityList<>(one, two));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.ORCHESTRATION_COLLECTION))
        .body("_embedded.orchestrations", hasSize(2))
        .body("_embedded.orchestrations[0].id", is("session-1"))
        .body("_embedded.orchestrations[0].state", is("RUNNING"))
        .body("_embedded.orchestrations[1].id", is("session-2"))
        .body("_embedded.orchestrations[1].state", is("REVIEW_REQUIRED"));
  }

  @Test
  void should_get_single_orchestration() {
    OrchestrationSession session =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(session));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/orchestrations/{orchestrationId}",
            project.getIdentity(),
            "session-1")
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.ORCHESTRATION))
        .body("id", is("session-1"))
        .body("goal", is("Ship onboarding"))
        .body("state", is("RUNNING"));
  }

  @Test
  void should_cancel_running_orchestration() {
    OrchestrationSession running =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));
    OrchestrationSession cancelled =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.CANCELLED,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                Instant.parse("2026-03-02T12:15:00Z"),
                "Cancelled by user"));

    when(orchestrationSessions.findByIdentity("session-1"))
        .thenReturn(Optional.of(running))
        .thenReturn(Optional.of(cancelled));

    OrchestrationApi.CancelOrchestrationRequest request =
        new OrchestrationApi.CancelOrchestrationRequest();
    request.setReason("Cancelled by user");
    request.setOccurredAt(Instant.parse("2026-03-02T12:15:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/orchestrations/{orchestrationId}/cancel",
            project.getIdentity(),
            "session-1")
        .then()
        .statusCode(200)
        .body("state", is("CANCELLED"))
        .body("failureReason", is("Cancelled by user"));

    verify(orchestrationSessions, times(1))
        .updateStatus(
            "session-1",
            OrchestrationSessionDescription.Status.CANCELLED,
            null,
            Instant.parse("2026-03-02T12:15:00Z"),
            "Cancelled by user");
  }

  @Test
  void should_return_conflict_when_cancel_completed_orchestration() {
    OrchestrationSession completed =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.COMPLETED,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                Instant.parse("2026-03-02T12:10:00Z"),
                null));

    when(orchestrationSessions.findByIdentity("session-1")).thenReturn(Optional.of(completed));

    OrchestrationApi.CancelOrchestrationRequest request =
        new OrchestrationApi.CancelOrchestrationRequest();
    request.setReason("Late cancel");
    request.setOccurredAt(Instant.parse("2026-03-02T12:15:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/orchestrations/{orchestrationId}/cancel",
            project.getIdentity(),
            "session-1")
        .then()
        .statusCode(409);

    verify(orchestrationSessions, never()).updateStatus(any(), any(), any(), any(), any());
  }
}
