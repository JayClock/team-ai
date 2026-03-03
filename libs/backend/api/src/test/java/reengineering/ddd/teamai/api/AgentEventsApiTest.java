package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.config.TraceIdFilter;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;

public class AgentEventsApiTest extends ApiTest {
  private Project project;
  private AgentEvent event;

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
            null);
    event =
        new AgentEvent(
            "event-1",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_ASSIGNED,
                new Ref<>("agent-1"),
                new Ref<>("task-1"),
                "Task assigned",
                Instant.parse("2026-01-01T00:00:00Z")));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(events.findAll()).thenReturn(new EntityList<>(event));
    when(events.findByIdentity(event.getIdentity())).thenReturn(Optional.of(event));
  }

  @Test
  void should_return_events_collection_with_create_rel() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/events", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.events", hasSize(1))
        .body("_embedded.events[0].id", is(event.getIdentity()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity() + "/events?page=0"))
        .body("_links.create-event.href", is("/api/projects/" + project.getIdentity() + "/events"))
        .body("_templates.create-event.method", is("POST"));
  }

  @Test
  void should_create_event() {
    AgentEvent created =
        new AgentEvent(
            "event-2",
            new AgentEventDescription(
                AgentEventDescription.Type.REPORT_SUBMITTED,
                new Ref<>("agent-1"),
                new Ref<>("task-1"),
                "Report submitted",
                Instant.parse("2026-01-02T00:00:00Z")));
    when(events.append(any(AgentEventDescription.class))).thenReturn(created);

    AgentEventsApi.CreateAgentEventRequest request = new AgentEventsApi.CreateAgentEventRequest();
    request.setType(AgentEventDescription.Type.REPORT_SUBMITTED);
    request.setAgentId("agent-1");
    request.setTaskId("task-1");
    request.setMessage("Report submitted");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/events", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(created.getIdentity()))
        .body("type", is("REPORT_SUBMITTED"))
        .body("_links.collection.href", is("/api/projects/" + project.getIdentity() + "/events"));

    verify(events, times(1)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_stream_snapshot_and_event_in_once_mode() {
    given(documentationSpec)
        .accept(MediaType.SERVER_SENT_EVENTS)
        .when()
        .get("/projects/{projectId}/events/stream?once=true", project.getIdentity())
        .then()
        .statusCode(200)
        .header(TraceIdFilter.TRACE_ID_HEADER, notNullValue())
        .contentType(startsWith(MediaType.SERVER_SENT_EVENTS))
        .body(containsString("event: snapshot"))
        .body(containsString("\"cursorSource\":\"none\""))
        .body(containsString("\"traceId\":\""))
        .body(containsString("event: agent-event"))
        .body(containsString("id: event-1"))
        .body(containsString("\"type\":\"TASK_ASSIGNED\""));
  }

  @Test
  void should_resume_stream_from_since_event_id() {
    AgentEvent second =
        new AgentEvent(
            "event-2",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_STATUS_CHANGED,
                new Ref<>("agent-2"),
                new Ref<>("task-2"),
                "Task moved to review",
                Instant.parse("2026-01-01T00:01:00Z")));
    when(events.findAll()).thenReturn(new EntityList<>(event, second));

    given(documentationSpec)
        .accept(MediaType.SERVER_SENT_EVENTS)
        .when()
        .get("/projects/{projectId}/events/stream?once=true&since=event-1", project.getIdentity())
        .then()
        .statusCode(200)
        .body(containsString("event: snapshot"))
        .body(containsString("\"resumeFromEventId\":\"event-1\""))
        .body(containsString("\"cursorSource\":\"since\""))
        .body(containsString("id: event-2"))
        .body(containsString("\"type\":\"TASK_STATUS_CHANGED\""));
  }

  @Test
  void should_resume_stream_from_last_event_id_header() {
    AgentEvent second =
        new AgentEvent(
            "event-2",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_STATUS_CHANGED,
                new Ref<>("agent-2"),
                new Ref<>("task-2"),
                "Task moved to review",
                Instant.parse("2026-01-01T00:01:00Z")));
    when(events.findAll()).thenReturn(new EntityList<>(event, second));

    given(documentationSpec)
        .accept(MediaType.SERVER_SENT_EVENTS)
        .header("Last-Event-ID", "event-1")
        .when()
        .get("/projects/{projectId}/events/stream?once=true", project.getIdentity())
        .then()
        .statusCode(200)
        .body(containsString("event: snapshot"))
        .body(containsString("\"resumeFromEventId\":\"event-1\""))
        .body(containsString("\"cursorSource\":\"last-event-id\""))
        .body(containsString("id: event-2"));
  }

  @Test
  void should_merge_since_and_last_event_id_with_latest_cursor() {
    AgentEvent second =
        new AgentEvent(
            "event-2",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_STATUS_CHANGED,
                new Ref<>("agent-2"),
                new Ref<>("task-2"),
                "Task moved to review",
                Instant.parse("2026-01-01T00:01:00Z")));
    AgentEvent third =
        new AgentEvent(
            "event-3",
            new AgentEventDescription(
                AgentEventDescription.Type.REPORT_SUBMITTED,
                new Ref<>("agent-3"),
                new Ref<>("task-3"),
                "Report submitted",
                Instant.parse("2026-01-01T00:02:00Z")));
    when(events.findAll()).thenReturn(new EntityList<>(event, second, third));

    given(documentationSpec)
        .accept(MediaType.SERVER_SENT_EVENTS)
        .header("Last-Event-ID", "event-2")
        .when()
        .get("/projects/{projectId}/events/stream?once=true&since=event-1", project.getIdentity())
        .then()
        .statusCode(200)
        .body(containsString("event: snapshot"))
        .body(containsString("\"resumeFromEventId\":\"event-2\""))
        .body(containsString("\"cursorSource\":\"merged\""))
        .body(containsString("id: event-3"))
        .body(containsString("\"type\":\"REPORT_SUBMITTED\""));
  }
}
