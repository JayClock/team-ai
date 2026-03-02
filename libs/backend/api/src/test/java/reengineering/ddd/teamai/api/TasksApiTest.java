package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
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
            events);
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
}
