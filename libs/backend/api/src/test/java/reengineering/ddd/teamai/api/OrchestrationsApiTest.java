package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
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
            null);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
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

    when(agents.findAll()).thenReturn(new EntityList<>(coordinator, implementer));
    when(agents.findByIdentity(coordinator.getIdentity())).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity(implementer.getIdentity())).thenReturn(Optional.of(implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity(createdTask.getIdentity())).thenReturn(Optional.of(createdTask));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setGoal("Implement feature");
    request.setAcceptanceCriteria(List.of("tests pass"));
    request.setVerificationCommands(List.of("./gradlew :backend:api:test"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(201)
        .body("goal", is("Implement feature"))
        .body("state", is("STARTED"))
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
    verify(events, times(4)).append(any(AgentEventDescription.class));
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

    when(agents.findAll()).thenReturn(new EntityList<>());
    when(agents.create(any(AgentDescription.class)))
        .thenReturn(coordinator)
        .thenReturn(implementer);
    when(agents.findByIdentity(coordinator.getIdentity())).thenReturn(Optional.of(coordinator));
    when(agents.findByIdentity(implementer.getIdentity())).thenReturn(Optional.of(implementer));
    when(tasks.create(any(TaskDescription.class))).thenReturn(createdTask);
    when(tasks.findByIdentity(createdTask.getIdentity())).thenReturn(Optional.of(createdTask));

    OrchestrationsApi.StartOrchestrationRequest request =
        new OrchestrationsApi.StartOrchestrationRequest();
    request.setGoal("Ship onboarding");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType("application/json")
        .body(request)
        .when()
        .post("/projects/{projectId}/orchestrations", project.getIdentity())
        .then()
        .statusCode(201)
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
    verify(events, times(6)).append(any(AgentEventDescription.class));
  }
}
