package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Member;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class A2aGatewayApiTest extends ApiTest {
  private static final String SHARED_TOKEN = "team-ai-a2a-dev-token";
  private static final String PROJECT_ID = "project-1";
  private static final String USER_ID = "user-1";
  private static final String TASK_ID = "task-1";
  private static final String CALLER_AGENT_ID = "agent-caller";
  private static final String ASSIGNEE_AGENT_ID = "agent-assignee";

  private Project project;
  private Task task;
  private Agent caller;
  private Agent assignee;
  private AgentEvent forwardedEvent;

  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.OrchestrationSessions orchestrationSessions;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            PROJECT_ID,
            new ProjectDescription("A2A Gateway Project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            orchestrationSessions,
            null,
            null);
    task =
        new Task(
            TASK_ID,
            new TaskDescription(
                "Implement gateway",
                "Support task forwarding",
                "backend/api",
                null,
                null,
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));
    caller =
        new Agent(
            CALLER_AGENT_ID,
            new AgentDescription(
                "Coordinator",
                AgentDescription.Role.DEVELOPER,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    assignee =
        new Agent(
            ASSIGNEE_AGENT_ID,
            new AgentDescription(
                "Implementer",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    forwardedEvent =
        new AgentEvent(
            "event-forward-1",
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_ASSIGNED,
                new Ref<>(CALLER_AGENT_ID),
                new Ref<>(TASK_ID),
                "forwarded",
                Instant.parse("2026-03-03T10:00:00Z")));

    when(projects.findByIdentity(PROJECT_ID)).thenReturn(Optional.of(project));
    when(members.findByIdentity(USER_ID))
        .thenReturn(
            Optional.of(new Member(USER_ID, new MemberDescription(new Ref<>(USER_ID), "OWNER"))));
    when(tasks.findByIdentity(TASK_ID)).thenReturn(Optional.of(task));
    when(agents.findByIdentity(CALLER_AGENT_ID)).thenReturn(Optional.of(caller));
    when(agents.findByIdentity(ASSIGNEE_AGENT_ID)).thenReturn(Optional.of(assignee));
    when(events.append(any(AgentEventDescription.class))).thenReturn(forwardedEvent);
  }

  @Test
  void should_forward_task_and_return_acp_envelopes() {
    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("X-A2A-Token", SHARED_TOKEN)
        .body(validTaskForwardRequest())
        .when()
        .post("/a2a/forward")
        .then()
        .statusCode(200)
        .body("status", is("SUCCESS"))
        .body("requestId", is("req-forward-1"))
        .body("response.kind", is("response"))
        .body("response.type", is("TASK_FORWARD_ACK"))
        .body("response.payload.projectId", is(PROJECT_ID))
        .body("response.payload.taskId", is(TASK_ID))
        .body("response.payload.assigneeAgentId", is(ASSIGNEE_AGENT_ID))
        .body("response.payload.attempts", is(1))
        .body("event.kind", is("event"))
        .body("event.type", is("TASK_ASSIGNED"))
        .body("event.id", is("event-forward-1"))
        .body("error", is((Object) null))
        .body("audit.projectId", is(PROJECT_ID))
        .body("audit.actorUserId", is(USER_ID));

    verify(tasks).assign(TASK_ID, new Ref<>(ASSIGNEE_AGENT_ID), new Ref<>(CALLER_AGENT_ID));
    verify(tasks).updateStatus(TASK_ID, TaskDescription.Status.IN_PROGRESS, null);
    verify(agents).updateStatus(new Ref<>(ASSIGNEE_AGENT_ID), AgentDescription.Status.ACTIVE);
    verify(events, times(4)).append(any(AgentEventDescription.class));
  }

  @Test
  void should_reject_invalid_gateway_token() {
    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("X-A2A-Token", "invalid-token")
        .body(validTaskForwardRequest())
        .when()
        .post("/a2a/forward")
        .then()
        .statusCode(401)
        .body("status", is("ERROR"))
        .body("error.code", is("A2A_AUTH_FAILED"))
        .body("error.retryable", is(false));

    verify(tasks, never()).assign(any(), any(), any());
  }

  @Test
  void should_reject_actor_when_not_project_member() {
    when(members.findByIdentity(USER_ID)).thenReturn(Optional.empty());

    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("X-A2A-Token", SHARED_TOKEN)
        .body(validTaskForwardRequest())
        .when()
        .post("/a2a/forward")
        .then()
        .statusCode(403)
        .body("status", is("ERROR"))
        .body("error.code", is("A2A_FORBIDDEN"))
        .body("error.retryable", is(false));

    verify(tasks, never()).assign(any(), any(), any());
  }

  @Test
  void should_return_protocol_error_for_unsupported_message_type() {
    Map<String, Object> request = new HashMap<>(validTaskForwardRequest());
    request.put("messageType", "PING");

    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("X-A2A-Token", SHARED_TOKEN)
        .body(request)
        .when()
        .post("/a2a/forward")
        .then()
        .statusCode(400)
        .body("status", is("ERROR"))
        .body("error.code", is("A2A_PROTOCOL_INVALID"))
        .body("error.retryable", is(false));

    verify(tasks, never()).assign(any(), any(), any());
  }

  @Test
  void should_retry_once_when_transient_forward_failure_happens() {
    doThrow(new RuntimeException("transient network glitch"))
        .doNothing()
        .when(tasks)
        .assign(eq(TASK_ID), eq(new Ref<>(ASSIGNEE_AGENT_ID)), eq(new Ref<>(CALLER_AGENT_ID)));

    Map<String, Object> request = new HashMap<>(validTaskForwardRequest());
    request.put("retryLimit", 1);

    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("X-A2A-Token", SHARED_TOKEN)
        .body(request)
        .when()
        .post("/a2a/forward")
        .then()
        .statusCode(200)
        .body("status", is("SUCCESS"))
        .body("response.payload.attempts", is(2))
        .body("audit.attempts", is(2));

    verify(tasks, times(2))
        .assign(eq(TASK_ID), eq(new Ref<>(ASSIGNEE_AGENT_ID)), eq(new Ref<>(CALLER_AGENT_ID)));
  }

  private Map<String, Object> validTaskForwardRequest() {
    return Map.of(
        "protocolVersion",
        "1.0",
        "requestId",
        "req-forward-1",
        "sourceInstance",
        "instance-alpha",
        "actorUserId",
        USER_ID,
        "projectId",
        PROJECT_ID,
        "messageType",
        "TASK_FORWARD",
        "payload",
        Map.of(
            "taskId",
            TASK_ID,
            "assigneeAgentId",
            ASSIGNEE_AGENT_ID,
            "callerAgentId",
            CALLER_AGENT_ID,
            "note",
            "forward this task"));
  }
}
