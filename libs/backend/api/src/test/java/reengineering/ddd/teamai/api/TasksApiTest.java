package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

public class TasksApiTest extends ApiTest {
  private Project project;
  private Task task;

  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            null,
            null,
            null);
    task =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.PENDING,
                new Ref<>("agent-1"),
                null,
                null,
                null,
                null));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(tasks.findAll()).thenReturn(new EntityList<>(task));
    when(tasks.findByIdentity(task.getIdentity())).thenReturn(Optional.of(task));
  }

  @Test
  void should_return_tasks_collection_with_create_rel() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/tasks", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.tasks", hasSize(1))
        .body("_embedded.tasks[0].id", is(task.getIdentity()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/tasks?page=0"))
        .body("_links.create-task.href", is("/api/projects/" + project.getIdentity() + "/tasks"))
        .body("_templates.create-task.method", is("POST"));
  }

  @Test
  void should_create_task() {
    Task created =
        new Task(
            "task-2",
            new TaskDescription(
                "Implement persistence",
                "Persist new models",
                "mybatis",
                List.of("migration", "mapper"),
                List.of("./gradlew :backend:persistent:mybatis:test"),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));
    when(tasks.create(any(TaskDescription.class))).thenReturn(created);

    TasksApi.CreateTaskRequest request = new TasksApi.CreateTaskRequest();
    request.setTitle("Implement persistence");
    request.setObjective("Persist new models");
    request.setScope("mybatis");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/tasks", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(created.getIdentity()))
        .body("title", is("Implement persistence"))
        .body("_links.collection.href", is("/api/projects/" + project.getIdentity() + "/tasks"));

    verify(tasks, times(1)).create(any(TaskDescription.class));
  }

  @Test
  void should_return_task_with_orchestration_affordances() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/tasks/{taskId}", project.getIdentity(), task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()))
        .body(
            "_links.delegate-task.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/tasks/"
                    + task.getIdentity()
                    + "/delegate"))
        .body(
            "_links.submit-task-for-review.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/tasks/"
                    + task.getIdentity()
                    + "/submit-review"))
        .body(
            "_links.approve-task.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/tasks/"
                    + task.getIdentity()
                    + "/approve"))
        .body(
            "_links.request-task-fix.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/tasks/"
                    + task.getIdentity()
                    + "/request-fix"));
  }

  @Test
  void should_delegate_task_for_execution() {
    Agent assignee =
        new Agent(
            "agent-1",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    Agent caller =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    when(agents.findByIdentity("agent-1")).thenReturn(Optional.of(assignee));
    when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(caller));

    TaskApi.DelegateTaskRequest request = new TaskApi.DelegateTaskRequest();
    request.setAssigneeId("agent-1");
    request.setCallerAgentId("agent-2");
    request.setOccurredAt(Instant.parse("2026-03-02T12:00:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/delegate",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()));

    verify(tasks).assign(task.getIdentity(), new Ref<>("agent-1"), new Ref<>("agent-2"));
    verify(tasks).updateStatus(task.getIdentity(), TaskDescription.Status.IN_PROGRESS, null);
    verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.ACTIVE);
    verify(events, times(3)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_delegate_task_to_specialist() {
    Agent assignee =
        new Agent(
            "agent-specialist",
            new AgentDescription(
                "Domain Specialist",
                AgentDescription.Role.SPECIALIST,
                "FAST",
                AgentDescription.Status.PENDING,
                new Ref<>("agent-2"),
                "Focus on domain logic"));
    Agent caller =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    when(agents.findByIdentity("agent-specialist")).thenReturn(Optional.of(assignee));
    when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(caller));

    TaskApi.DelegateTaskRequest request = new TaskApi.DelegateTaskRequest();
    request.setAssigneeId("agent-specialist");
    request.setCallerAgentId("agent-2");
    request.setOccurredAt(Instant.parse("2026-03-02T12:00:00Z"));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/delegate",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()));

    verify(tasks).assign(task.getIdentity(), new Ref<>("agent-specialist"), new Ref<>("agent-2"));
    verify(tasks).updateStatus(task.getIdentity(), TaskDescription.Status.IN_PROGRESS, null);
    verify(agents).updateStatus(new Ref<>("agent-specialist"), AgentDescription.Status.ACTIVE);
    verify(events, times(3)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_replay_delegate_when_request_id_is_reused() {
    Task delegated =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.IN_PROGRESS,
                new Ref<>("agent-1"),
                new Ref<>("agent-2"),
                null,
                null,
                null));
    when(tasks.findByDelegateRequestId("req-delegate-1")).thenReturn(Optional.of(delegated));

    TaskApi.DelegateTaskRequest request = new TaskApi.DelegateTaskRequest();
    request.setRequestId("req-delegate-1");
    request.setAssigneeId("agent-1");
    request.setCallerAgentId("agent-2");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/delegate",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()))
        .body("status", is("IN_PROGRESS"));

    verify(tasks, never()).assign(any(), any(), any());
    verify(tasks, never()).updateStatus(any(), any(), any());
    verify(agents, never()).updateStatus(any(), any());
    verify(events, never()).append(any(AgentEventDescription.class));
  }

  @Test
  void should_submit_task_for_review() {
    Task inProgressTask =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.IN_PROGRESS,
                new Ref<>("agent-1"),
                null,
                null,
                null,
                null));
    Agent implementer =
        new Agent(
            "agent-1",
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    when(tasks.findByIdentity(task.getIdentity())).thenReturn(Optional.of(inProgressTask));
    when(agents.findByIdentity("agent-1")).thenReturn(Optional.of(implementer));

    TaskApi.SubmitTaskForReviewRequest request = new TaskApi.SubmitTaskForReviewRequest();
    request.setImplementerAgentId("agent-1");
    request.setCompletionSummary("implemented");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/submit-review",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()));

    verify(tasks)
        .updateStatus(task.getIdentity(), TaskDescription.Status.REVIEW_REQUIRED, "implemented");
    verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.COMPLETED);
    verify(events, times(3)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_approve_task() {
    Task reviewTask =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.REVIEW_REQUIRED,
                new Ref<>("agent-1"),
                null,
                "ready",
                null,
                null));
    Agent reviewer =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Gate", AgentDescription.Role.GATE, "SMART", AgentDescription.Status.ACTIVE, null));
    when(tasks.findByIdentity(task.getIdentity())).thenReturn(Optional.of(reviewTask));
    when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(reviewer));

    TaskApi.VerifyTaskRequest request = new TaskApi.VerifyTaskRequest();
    request.setReviewerAgentId("agent-2");
    request.setVerificationReport("passed");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/approve",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()));

    verify(tasks)
        .report(
            task.getIdentity(),
            new Ref<>("agent-2"),
            new reengineering.ddd.teamai.description.TaskReportDescription(
                "Verification approved", true, "passed"));
    verify(tasks).updateStatus(task.getIdentity(), TaskDescription.Status.COMPLETED, "ready");
    verify(agents).updateStatus(new Ref<>("agent-2"), AgentDescription.Status.COMPLETED);
    verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.COMPLETED);
    verify(events, times(5)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_replay_approve_when_request_id_is_reused() {
    Task approved =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.COMPLETED,
                new Ref<>("agent-1"),
                null,
                "ready",
                TaskDescription.VerificationVerdict.APPROVED,
                "passed"));
    when(tasks.findByApproveRequestId("req-approve-1")).thenReturn(Optional.of(approved));

    TaskApi.VerifyTaskRequest request = new TaskApi.VerifyTaskRequest();
    request.setRequestId("req-approve-1");
    request.setReviewerAgentId("agent-2");
    request.setVerificationReport("passed");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/approve",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()))
        .body("status", is("COMPLETED"));

    verify(tasks, never()).report(any(), any(), any());
    verify(tasks, never()).updateStatus(any(), any(), any());
    verify(agents, never()).updateStatus(any(), any());
    verify(events, never()).append(any(AgentEventDescription.class));
  }

  @Test
  void should_request_task_fix() {
    Task reviewTask =
        new Task(
            "task-1",
            new TaskDescription(
                "Implement API",
                "Add endpoints",
                "api module",
                List.of("add tests"),
                List.of("./gradlew :backend:api:test"),
                TaskDescription.Status.REVIEW_REQUIRED,
                new Ref<>("agent-1"),
                null,
                "ready",
                null,
                null));
    Agent reviewer =
        new Agent(
            "agent-2",
            new AgentDescription(
                "Gate", AgentDescription.Role.GATE, "SMART", AgentDescription.Status.ACTIVE, null));
    when(tasks.findByIdentity(task.getIdentity())).thenReturn(Optional.of(reviewTask));
    when(agents.findByIdentity("agent-2")).thenReturn(Optional.of(reviewer));

    TaskApi.VerifyTaskRequest request = new TaskApi.VerifyTaskRequest();
    request.setReviewerAgentId("agent-2");
    request.setVerificationReport("failed");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/tasks/{taskId}/request-fix",
            project.getIdentity(),
            task.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(task.getIdentity()));

    verify(tasks)
        .report(
            task.getIdentity(),
            new Ref<>("agent-2"),
            new reengineering.ddd.teamai.description.TaskReportDescription(
                "Verification rejected", false, "failed"));
    verify(tasks).updateStatus(task.getIdentity(), TaskDescription.Status.NEEDS_FIX, "ready");
    verify(agents).updateStatus(new Ref<>("agent-2"), AgentDescription.Status.COMPLETED);
    verify(agents).updateStatus(new Ref<>("agent-1"), AgentDescription.Status.ACTIVE);
    verify(events, times(5)).append(any(AgentEventDescription.class));
  }
}
