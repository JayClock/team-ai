package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.restassured.response.Response;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
            null,
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
  void should_create_session_with_parent_session_id() {
    AcpSession parent = session("700", "user-7", AcpSessionDescription.Status.RUNNING);
    AcpSession child = session("701", "user-7", AcpSessionDescription.Status.PENDING, "700");
    when(acpSessions.findByIdentity("700")).thenReturn(Optional.of(parent));
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(child);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-7",
                        "provider", "team-ai",
                        "mode", "CHAT",
                        "parentSessionId", "700"),
                "id", "req-new-701"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("result.session.id", equalTo("701"))
        .body("result.session.parentSessionId", equalTo("700"))
        .body("result.cached", equalTo(false))
        .body("error", equalTo(null));

    ArgumentCaptor<AcpSessionDescription> descriptionCaptor =
        ArgumentCaptor.forClass(AcpSessionDescription.class);
    verify(acpSessions).create(descriptionCaptor.capture());
    assertEquals("700", descriptionCaptor.getValue().parentSession().id());
  }

  @Test
  void should_return_cached_session_when_idempotency_key_is_reused() {
    AcpSession pending = session("710", "user-7", AcpSessionDescription.Status.PENDING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);
    when(acpSessions.findByIdentity("710")).thenReturn(Optional.of(pending));

    Map<String, Object> params =
        Map.of(
            "projectId", "project-1",
            "actorUserId", "user-7",
            "provider", "team-ai",
            "mode", "CHAT",
            "idempotencyKey", "idem-710");

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0", "method", "session/new", "params", params, "id", "req-new-710-a"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("result.session.id", equalTo("710"))
        .body("result.cached", equalTo(false))
        .body("error", equalTo(null));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0", "method", "session/new", "params", params, "id", "req-new-710-b"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200)
        .body("result.session.id", equalTo("710"))
        .body("result.cached", equalTo(true))
        .body("error", equalTo(null));

    verify(acpSessions, times(1)).create(any(AcpSessionDescription.class));
    verify(agentRuntime, times(1)).start(any(AgentRuntime.StartRequest.class));
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
        .queryParam("once", true)
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

  @Test
  void should_return_session_history_for_project_session_resource() {
    AcpSession pending = session("601", "user-6", AcpSessionDescription.Status.PENDING);
    AcpSession running = session("601", "user-6", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);
    when(acpSessions.findByIdentity("601"))
        .thenReturn(
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(running),
            Optional.of(running));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-6",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-new-601"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/prompt",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "601",
                        "prompt", "generate summary"),
                "id", "req-prompt-601"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    given(documentationSpec)
        .accept("application/json")
        .queryParam("limit", 10)
        .when()
        .get("/projects/{projectId}/sessions/{sessionId}/history", "project-1", "601")
        .then()
        .statusCode(200)
        .body("projectId", equalTo("project-1"))
        .body("sessionId", equalTo("601"))
        .body("history.size()", equalTo(3))
        .body("history[0].type", equalTo("status"))
        .body("history[1].type", equalTo("delta"))
        .body("history[2].type", equalTo("complete"));
  }

  @Test
  void should_filter_session_history_with_since_cursor() {
    AcpSession pending = session("602", "user-6", AcpSessionDescription.Status.PENDING);
    AcpSession running = session("602", "user-6", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);
    when(acpSessions.findByIdentity("602"))
        .thenReturn(
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(running),
            Optional.of(running),
            Optional.of(running));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-6",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-new-602"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/prompt",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "602",
                        "prompt", "generate summary"),
                "id", "req-prompt-602"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    Response fullHistory =
        given(documentationSpec)
            .accept("application/json")
            .queryParam("limit", 10)
            .when()
            .get("/projects/{projectId}/sessions/{sessionId}/history", "project-1", "602")
            .then()
            .statusCode(200)
            .extract()
            .response();

    List<String> eventIds = fullHistory.jsonPath().getList("history.eventId");
    assertNotNull(eventIds);
    assertEquals(3, eventIds.size());

    given(documentationSpec)
        .accept("application/json")
        .queryParam("limit", 10)
        .queryParam("since", eventIds.get(0))
        .when()
        .get("/projects/{projectId}/sessions/{sessionId}/history", "project-1", "602")
        .then()
        .statusCode(200)
        .body("history.size()", equalTo(2))
        .body("history[0].eventId", equalTo(eventIds.get(1)))
        .body("history[1].eventId", equalTo(eventIds.get(2)));
  }

  @Test
  void should_resume_sse_with_since_cursor_prioritized_over_last_event_id_header() {
    AcpSession pending = session("603", "user-6", AcpSessionDescription.Status.PENDING);
    AcpSession running = session("603", "user-6", AcpSessionDescription.Status.RUNNING);
    when(acpSessions.create(any(AcpSessionDescription.class))).thenReturn(pending);
    when(acpSessions.findByIdentity("603"))
        .thenReturn(
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(pending),
            Optional.of(running),
            Optional.of(running));

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/new",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "actorUserId", "user-6",
                        "provider", "team-ai",
                        "mode", "CHAT"),
                "id", "req-new-603"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    given(documentationSpec)
        .contentType("application/json")
        .body(
            Map.of(
                "jsonrpc", "2.0",
                "method", "session/prompt",
                "params",
                    Map.of(
                        "projectId", "project-1",
                        "sessionId", "603",
                        "prompt", "generate summary"),
                "id", "req-prompt-603"))
        .when()
        .post("/acp")
        .then()
        .statusCode(200);

    Response historyResponse =
        given(documentationSpec)
            .accept("application/json")
            .queryParam("limit", 10)
            .when()
            .get("/projects/{projectId}/sessions/{sessionId}/history", "project-1", "603")
            .then()
            .statusCode(200)
            .extract()
            .response();
    List<String> eventIds = historyResponse.jsonPath().getList("history.eventId");
    assertNotNull(eventIds);
    assertEquals(3, eventIds.size());

    String resumedBody =
        given(documentationSpec)
            .accept("text/event-stream")
            .queryParam("sessionId", "603")
            .queryParam("since", eventIds.get(0))
            .queryParam("once", true)
            .header("Last-Event-ID", eventIds.get(1))
            .when()
            .get("/acp")
            .then()
            .statusCode(200)
            .contentType(containsString("text/event-stream"))
            .extract()
            .asString();

    assertTrue(resumedBody.contains("id: " + eventIds.get(1)));
    assertTrue(resumedBody.contains("id: " + eventIds.get(2)));
    assertFalse(resumedBody.contains("id: " + eventIds.get(0)));

    String lastEventIdBody =
        given(documentationSpec)
            .accept("text/event-stream")
            .queryParam("sessionId", "603")
            .queryParam("once", true)
            .header("Last-Event-ID", eventIds.get(0))
            .when()
            .get("/acp")
            .then()
            .statusCode(200)
            .contentType(containsString("text/event-stream"))
            .extract()
            .asString();

    assertTrue(lastEventIdBody.contains("id: " + eventIds.get(1)));
    assertTrue(lastEventIdBody.contains("id: " + eventIds.get(2)));
    assertFalse(lastEventIdBody.contains("id: " + eventIds.get(0)));
  }

  @Test
  void should_read_gateway_mode_status() {
    given(documentationSpec)
        .accept("application/json")
        .when()
        .get("/acp/gateway/mode")
        .then()
        .statusCode(200)
        .body("requestedMode", equalTo("local"))
        .body("effectiveMode", equalTo("local"))
        .body("rollback.errorThreshold", notNullValue())
        .body("rollback.windowMs", notNullValue())
        .body("rollback.cooldownMs", notNullValue());
  }

  @Test
  void should_switch_gateway_mode_without_restart() {
    given(documentationSpec)
        .contentType("application/json")
        .body(Map.of("mode", "remote"))
        .when()
        .post("/acp/gateway/mode")
        .then()
        .statusCode(200)
        .body("requestedMode", equalTo("remote"));

    given(documentationSpec)
        .accept("application/json")
        .when()
        .get("/acp/gateway/mode")
        .then()
        .statusCode(200)
        .body("requestedMode", equalTo("remote"));

    given(documentationSpec)
        .contentType("application/json")
        .body(Map.of("mode", "local"))
        .when()
        .post("/acp/gateway/mode")
        .then()
        .statusCode(200)
        .body("requestedMode", equalTo("local"));
  }

  private AcpSession session(
      String sessionId, String actorUserId, AcpSessionDescription.Status status) {
    return session(sessionId, actorUserId, status, null);
  }

  private AcpSession session(
      String sessionId,
      String actorUserId,
      AcpSessionDescription.Status status,
      String parentSessionId) {
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
            new Ref<>("evt-" + sessionId),
            parentSessionId == null ? null : new Ref<>(parentSessionId)));
  }
}
