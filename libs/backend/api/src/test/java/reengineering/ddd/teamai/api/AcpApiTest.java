package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.config.TraceIdFilter;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;
import reengineering.ddd.teamai.model.Project;

class AcpApiTest extends ApiTest {
  private Project project;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.OrchestrationSessions orchestrationSessions;
  @Mock private Project.AcpSessions acpSessions;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("ACP Project"),
            projectMembers,
            projectConversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            orchestrationSessions,
            acpSessions,
            null);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(agentRuntime.start(any(AgentRuntime.StartRequest.class)))
        .thenAnswer(
            invocation -> {
              AgentRuntime.StartRequest request = invocation.getArgument(0);
              return new AgentRuntime.SessionHandle(
                  "runtime-" + request.orchestrationId(),
                  request.orchestrationId(),
                  request.agentId(),
                  Instant.parse("2026-03-03T10:00:00Z"));
            });
    when(agentRuntime.send(
            any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenReturn(
            new AgentRuntime.SendResult("runtime output", Instant.parse("2026-03-03T10:00:02Z")));
  }

  @Test
  void should_initialize_acp_via_json_rpc() {
    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "initialize",
                "params", Map.of("client", "web"),
                "id", "req-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-1"))
        .body("result.server.name", equalTo("team-ai-acp"))
        .body("result.capabilities.sse", equalTo(true))
        .body(
            "result.methods",
            contains(
                "initialize", "session/new", "session/prompt", "session/cancel", "session/load"))
        .body("error", equalTo(null));
  }

  @Test
  void should_propagate_trace_id_for_rpc_response() {
    AcpSession pending = session("trace-1", "user-trace", AcpSessionDescription.Status.PENDING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);

    given(documentationSpec)
        .contentType("application/json")
        .header(TraceIdFilter.TRACE_ID_HEADER, "trace-acp-1")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-trace",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-trace-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .header(TraceIdFilter.TRACE_ID_HEADER, equalTo("trace-acp-1"))
        .body("result.traceId", equalTo("trace-acp-1"))
        .body("error", equalTo(null));
  }

  @Test
  void should_create_session_via_json_rpc() {
    AcpSession pending = session("101", "user-1", AcpSessionDescription.Status.PENDING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-1",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-new-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-new-1"))
        .body("result.accepted", equalTo(true))
        .body("result.session.id", equalTo("101"))
        .body("result.session.projectId", equalTo("project-1"))
        .body("result.session.actorUserId", equalTo("user-1"))
        .body("result.session.state", equalTo("PENDING"))
        .body("error", equalTo(null));

    verify(acpSessions).create(any(AcpSessionDescription.class));
    verify(agentRuntime).start(any(AgentRuntime.StartRequest.class));
  }

  @Test
  void should_load_session_via_json_rpc() {
    AcpSession running = session("201", "user-2", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.findByIdentity("201")).thenReturn(Optional.of(running));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/load",
                "params", Map.of("projectId", "project-1", "sessionId", "201"),
                "id", "req-load-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-load-1"))
        .body("result.session.id", equalTo("201"))
        .body("result.session.state", equalTo("RUNNING"))
        .body("error", equalTo(null));
  }

  @Test
  void should_prompt_session_and_mark_running_when_pending() {
    AcpSession pending = session("301", "user-3", AcpSessionDescription.Status.PENDING);
    AcpSession running = session("301", "user-3", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.findByIdentity("301"))
        .thenReturn(
            Optional.of(pending), Optional.of(pending), Optional.of(pending), Optional.of(running));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/prompt",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "301",
                        "prompt", "Summarize the latest updates",
                        "eventId", "evt-301"),
                "id", "req-prompt-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-prompt-1"))
        .body("result.accepted", equalTo(true))
        .body("result.session.id", equalTo("301"))
        .body("result.session.state", equalTo("RUNNING"))
        .body("result.prompt.content", equalTo("Summarize the latest updates"))
        .body("result.runtime.output", equalTo("runtime output"))
        .body("error", equalTo(null));

    verify(acpSessions)
        .updateStatus(
            eq("301"),
            eq(AcpSessionDescription.Status.RUNNING),
            eq((Instant) null),
            eq((String) null));
    verify(acpSessions).touch(eq("301"), any());
    verify(acpSessions).bindLastEventId("301", "evt-301");
    verify(agentRuntime)
        .send(any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class));
  }

  @Test
  void should_cancel_session_via_json_rpc() {
    AcpSession pending = session("401", "user-4", AcpSessionDescription.Status.PENDING);
    AcpSession running = session("401", "user-4", AcpSessionDescription.Status.RUNNING);
    AcpSession cancelled = session("401", "user-4", AcpSessionDescription.Status.CANCELLED);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);
    when(acpSessions.findByIdentity("401"))
        .thenReturn(Optional.of(running), Optional.of(cancelled));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-4",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-new-401"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/cancel",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "401",
                        "reason", "user requested"),
                "id", "req-cancel-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo("req-cancel-1"))
        .body("result.cancelled", equalTo(true))
        .body("result.session.id", equalTo("401"))
        .body("result.session.state", equalTo("CANCELLED"))
        .body("error", equalTo(null));

    verify(acpSessions)
        .updateStatus(
            eq("401"),
            eq(AcpSessionDescription.Status.CANCELLED),
            any(Instant.class),
            eq("user requested"));
    verify(agentRuntime).stop(any(AgentRuntime.SessionHandle.class));
  }

  @Test
  void should_return_invalid_params_when_required_fields_are_missing() {
    given(documentationSpec)
        .contentType("application/json")
        .body(Map.of("jsonrpc", "2.0", "method", "session/new", "params", Map.of(), "id", 101))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo(101))
        .body("result", equalTo(null))
        .body("error.code", equalTo(-32602))
        .body("error.message", containsString("projectId"));
  }

  @Test
  void should_map_session_not_found_error() {
    when(acpSessions.findByIdentity("999")).thenReturn(Optional.empty());

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/load",
                "params", Map.of("projectId", "project-1", "sessionId", "999"),
                "id", "req-load-missing"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("result", equalTo(null))
        .body("error.code", equalTo(-32004))
        .body("error.meta.acpCode", equalTo("ACP_SESSION_NOT_FOUND"))
        .body("error.meta.httpStatus", equalTo(404))
        .body("error.meta.retryable", equalTo(false));
  }

  @Test
  void should_map_runtime_timeout_error() {
    AcpSession pending = session("302", "user-3", AcpSessionDescription.Status.PENDING);
    when(acpSessions.findByIdentity("302"))
        .thenReturn(Optional.of(pending), Optional.of(pending), Optional.of(pending));
    when(agentRuntime.send(
            any(AgentRuntime.SessionHandle.class), any(AgentRuntime.SendRequest.class)))
        .thenThrow(new AgentRuntimeTimeoutException("runtime timeout"));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/prompt",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "302",
                        "prompt", "timeout case",
                        "timeoutMs", 10),
                "id", "req-timeout-1"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("result", equalTo(null))
        .body("error.code", equalTo(-32060))
        .body("error.message", containsString("runtime timeout"))
        .body("error.meta.acpCode", equalTo("ACP_RUNTIME_TIMEOUT"))
        .body("error.meta.httpStatus", equalTo(504))
        .body("error.meta.retryable", equalTo(true));
  }

  @Test
  void should_return_method_not_found_for_unknown_rpc_method() {
    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc",
                "2.0",
                "method",
                "session/unknown",
                "params",
                Map.of("projectId", "project-1"),
                "id",
                100))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("jsonrpc", equalTo("2.0"))
        .body("id", equalTo(100))
        .body("result", equalTo(null))
        .body("error.code", equalTo(-32601))
        .body("error.message", containsString("Method not found"));
  }

  @Test
  void should_open_acp_sse_stream() {
    given(documentationSpec)
        .accept("text/event-stream")
        .queryParam("sessionId", "s-1")
        .when()
        .get("/acp")
        .then()
        .statusCode(200)
        .contentType(containsString("text/event-stream"))
        .body(containsString("sessionId"))
        .body(containsString("s-1"))
        .body(containsString("\"type\":\"status\""))
        .body(containsString("\"transport\":\"sse\""))
        .body(containsString("\"eventId\":\"acp-s-1-status-"))
        .body(containsString("CONNECTED"))
        .body(notNullValue());
  }

  private AcpSession session(
      String sessionId, String actorUserId, AcpSessionDescription.Status status) {
    return new AcpSession(
        sessionId,
        new AcpSessionDescription(
            new Ref<>("project-1"),
            new Ref<>(actorUserId),
            "team-ai",
            "CHAT",
            status,
            Instant.parse("2026-03-03T10:00:00Z"),
            Instant.parse("2026-03-03T10:01:00Z"),
            status.isTerminal() ? Instant.parse("2026-03-03T10:02:00Z") : null,
            status == AcpSessionDescription.Status.FAILED ? "runtime failed" : null,
            "evt-" + sessionId));
  }
}
